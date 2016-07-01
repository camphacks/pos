var NEW_DB = false;
var CE = (function(ce_){
	//"use strict";
	
	window.indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB;
	var db;	
	
	/* CONTANSTS!! DATABASE NAME AND STORE NAMES */
	var DB_NAME = "ce_pos";
	var STORE = {
		settings : "settings",
		users : "users",
		accounts : "camp_accounts",
		merch : "merchandise",
		tiers : "price_books",
		sales : "sales",
		session : "session",
		logs : "logs"
	}	
	/* initialization object for database */
	
	/******* START PRIVATE DB SETUP FUNCTIONS ********/
	// Calls a reset DB or a setup DB depending on if NEW_DB is set
	var dbReadyPromise =  NEW_DB ? resetDb() : setupDb();
	
	/*
	 * Called on start up when the DB should be deleted and recreated
	 */
	function resetDb() { 
		var def = $.Deferred();
		CE.log.warn("Deleting old database: " + DB_NAME);	
		
		if(db)
			db.close();
		db = undefined;
		var delRequest = window.indexedDB.deleteDatabase(DB_NAME);
		
		delRequest.onblocked = function(e) { 
			CE.log.warn("The delete request for the database is being blocked", e); 
		};
		
		delRequest.onsuccess = function() { 
			var promise = setupDb();
			
			CE.log.info('The database was sucessfully deleted.');
			promise.done(function() { CE.log.info('The database was successfully setup'); def.resolve(); });
			promise.fail(function(e) { CE.log.fatal('The database setup failed', e); def.reject(e); });			
			
		};		

		delRequest.onerror = function(e) { 
			CE.log.error("The delete request for the database has failed", e); 
			def.reject(e); 
		};		

		return def.promise();
	}
	
	function clearDb(){
		var def = $.Deferred();
		var promises = [];		
		
		promises.push( clear(STORE.users) );	//Clear all the users because sandbox vs live have different users
		promises.push( clear(STORE.accounts) );	//Clear all the account because sandbox vs live have different camp accounts
		promises.push( clear(STORE.merch) );	//Clear all the merch because sandbox vs live have different products and stock
		promises.push( clear(STORE.tiers) );	//Clear all the pricebooks because sandbox vs live have different pricebooks
		//Dont need to clear STORE.sales
		//Dont need to clear STORE.session
		promises.push( setCurrentSession() );	//Clear the current session because we cannot be logged in to the wrong account
		promises.push(CE.DB.settings.put("last_sync", 0));		//Reset the last sync time so we will have a full sync next time.
		promises.push(CE.DB.settings.put("current_session", -1));//Reset the current session pointer so we will not try to use it
		
		return $.when.apply($, promises);
	}
	
	/*
	 * Creates a connection to the DB and stores as a local property
	 * Sets ups stores and indexes if needed
	 */
	function setupDb() { 	
		var def = $.Deferred();
		var request = indexedDB.open(DB_NAME, 3);

		request.onupgradeneeded = function(){
				CE.log.info('The database is being upgraded');
				
				var db = request.result;			
				var settingsStore = db.createObjectStore(STORE.settings, {
					autoIncrement : false,
					keyPath : "key"
				});
				settingsStore.put({key: "created", v: new Date().getTime() });
				settingsStore.put({key: "endpoint_sandbox", v: 'https://dev-campeagle.cs15.force.com/pos/services/apexrest/PointOfSale/'}); //cs16
				settingsStore.put({key: "endpoint_live", v: 'https://campeagle.secure.force.com/pos/services/apexrest/PointOfSale/'});
				settingsStore.put({key: "live_mode", v: 1});
				
				var sessionStore = db.createObjectStore(STORE.session, {
					autoIncrement: true,
					keyPath : 'id'
				});
				
	
				var usersStore = db.createObjectStore(STORE.users, {
					autoIncrement : false,
					keyPath : "username"
				});
				
				var accountsStore = db.createObjectStore(STORE.accounts, { 
					autoIncrement : false,
					keyPath : "id"
				});
				accountsStore.createIndex("mod_time", "mod_time", {unique: false});
				accountsStore.createIndex("name_lc", "name_lc", {unique: false});
				accountsStore.createIndex("first_name_lc", "first_name_lc", {unique: false});
				accountsStore.createIndex("last_name_lc", "last_name_lc", {unique: false});
				
				var merchStore = db.createObjectStore(STORE.merch, { 
					autoIncrement : false,
					keyPath : "id"
				});
				merchStore.createIndex("mod_time", "mod_time", {unique: false});
				merchStore.createIndex("sku", "sku", {unique : true });
				merchStore.createIndex("name_lc", "name_lc", {unique: false});
				
				var tiersStore = db.createObjectStore(STORE.tiers, { 
					autoIncrement : false,
					keyPath : "id"
				});
				tiersStore.createIndex("mod_time", "mod_time", {unique: false});
				
				var salesStore = db.createObjectStore(STORE.sales, {
					autoIncrement : true,
					keyPath : "local_id"
				});
				salesStore.createIndex("id", "id", {unique: false});
				salesStore.createIndex("uploaded", "uploaded", {unique: false});
				
				var logsStore = db.createObjectStore(STORE.logs, {
					autoIncrement: true,
					keyPath : 'id'
				});
				
			} //on upgrade needed
	
		request.onsuccess = function(){
			CE.log.info("The database is ready to use");
			db = request.result;
			def.resolve();
		}
		
		request.onerror = function(e) { 
			CE.log.fatal("The database could not be loaded", e );
			def.reject(e);
		}		

		return def.promise();
	}
	/******* END PRIVATE DB SETUP FUNCTIONS ********/

	
	/******* START PRIVATE HELPER FUNCTIONS ********/
	/*
	 * Called when needed to search a store and get a list of results.
	 * store: The string of the store name to search.
	 * index: OPTIONAL the index (if any) to search inside
	 * qstring: the String or Array of two strings to search from Example-> qstring = ["Skit", "Skiu"] 
	 * deep: Boolean to search every word in the index or just the first. 
	 */
	function search(store, index, qstring, deep){
		if(!Array.isArray(qstring))
			qstring = [qstring];
			
		var def = $.Deferred();

		CE.log.debug("The " + store + ' store is being searched with index, ' + index + '. Deep search: ' + (deep ? "true" : "false"));
		
		if(qstring.length > 0)
		{	
			var os = db.transaction(store, "readonly").objectStore(store);
			os = index ? os.index(index) : os; 
			
			//Setup begining bound and end bound
			qstring[1] = qstring[1] || qstring[0].increment();
			
			if(typeof qstring[0] === "string")
				qstring[0] = qstring[0].trim();			
				
			if(typeof qstring[1] === "string")
				qstring[1] = qstring[1].trim();
			
			//Make a key range to pull from DB
			var range = IDBKeyRange.bound(qstring[0], qstring[1], false, true);
	
			//Open cusor with the range or without. Use without if it is a deep search
			var request = os.openCursor( deep ? null : range );
			var list = [];

			request.onsuccess = function(e){
				var cursor = e.target.result;
				if(cursor)
				{
					if( !deep || cursor.key.containsAllWords( qstring[0] ))
						list.push(cursor.value);
					cursor.continue();
				}
				else 
					def.resolve(list);
			};		
		
			request.onerror = function() { def.reject() };
		}
		else
			throw 'Invalid Search';
		
		return def.promise();
	}
	
	function clear(store){
		CE.log.warn('Clearing store: ' + store);
		
		var os = db.transaction(store, "readwrite").objectStore(store);
		var def = $.Deferred();
		
		var request = os.clear();

		request.onsuccess = function(){
			def.resolve();
		};
		
		request.onerror = function(){
			def.reject();
		}
		
		return def.promise();
	}
	
	function getFrom(keys, store, index, returnObject){
		var os = db.transaction(store, "readonly").objectStore(store);		
		var request;
		var def = $.Deferred();
		
		if(index)
			os = os.index(index);

		if(Array.isArray(keys) && keys.length > 1) //Get multiple at a time using cursor
		{
			request = os.openCursor();
			var list = {};
			
			request.onsuccess = function(e) {
				var cursor = e.target.result;
				if(cursor)
				{
					if( keys.indexOf(cursor.key) >= 0)
						list[cursor.key] =  cursor.value;
					cursor.continue();
				}
				else 
					def.resolve(list);
			};
		}
		else //Only single fetch needed
		{

			var key = Array.isArray(keys) ? keys[0] : keys;
			request = os.get(key);	
			request.onsuccess = function(e) { 
				if(e.target.result) 
				{
					var ret = {};
					if(returnObject)
						ret[ key ] = e.target.result;
					else
						ret = e.target.result;
					
					def.resolve(ret); 
				}
				else 
					def.reject(e); 
			};				
		}

		request.onerror = function(e) { def.reject(e) };
		
		return def.promise();
	}
	
	function getAllFrom(store){
		var def = $.Deferred();
		var request = db.transaction([store], "readonly").objectStore(store).openCursor();
		var list = {};
		
		request.onsuccess = function(e) {
			var cursor = e.target.result;
			if(cursor)
			{
				list[cursor.key] =  cursor.value;
				cursor.continue();
			}
			else 
				def.resolve(list);
		};
		
		request.onerror = function(e) { def.reject(e); }
		
		return def.promise();
	}
	
	function putAllInto(list, store){
		var def = $.Deferred();
		list = Array.isArray(list) ? list : [list];
		var tx = db.transaction(store, "readwrite"); 
		var os = tx.objectStore(store);
		
		for(var i in list)
		{
			console.log('attempting to put: ' + list[i]);
			os.put(list[i]);
		}
		
		tx.oncomplete = function(e) { def.resolve(e); };		
		tx.onerror = function(e) { def.reject(e); };
		
		return def.promise();
	}
	
	function propToLower(arrayOfObjs, oldProp, newProp) { 
		newProp = newProp || oldProp;
		
		for(var i in arrayOfObjs)
		{
			var o = arrayOfObjs[i];
			/*if(newProp == 'first_name_lc')
			{
				for(var p in o)
					console.log('p: ' + p + ', ' + o[p]);
				console.log('updating o['+newProp+'], ' + o[newProp] + ' to: ' + o[oldProp]);
			}*/
			if(o != null)
			{
				if(o[ oldProp ] != null)
					o[ newProp ] = ( o[ oldProp ] || '').toLowerCase();
			}
		}
	}
	
	function arrayToObject(array, keyPath) { 
		var obj = {};
		for( var i in array )
			obj[ array[i][keyPath] ] = array[i];
		return obj;
	}
	
	/******* END PRIVATE HELPER FUNCTIONS ********/
	
	
	/******* START SETTINGS FUNCTIONS ********/	
	var putSettings = function(key, value){
		var list = [];

		if(typeof key == "object" && !Array.isArray(key))
		{
			for(var k in key)
				if( typeof key[k] !== "undefined" )
					list.push( {"key":k, "v":key[k]} ); 
		}
		else if(typeof key !== "undefined" && typeof value !== "undefined")
		{
			list.push( {"key":key, "v":value} );
		}
		if(list.length > 0)
			return putAllInto(list, STORE.settings);
		return $.Deferred().resolve();  //resolve instantly
	}
	
	var getSettings = function(key) {
		return getFrom(key, STORE.settings)
			.then( function(objs) {
				if( Array.isArray(key))
				{
					for(var i in objs)
						if(objs[i])
							objs[i] = objs[i].v || '';
					
					return objs;
				}
				else
				{
					var temp = {};
					if(objs )
						temp[ objs.key ] = objs.v;
						
					return temp;
				}
			}, function(e) { return $.Deferred().resolve({}) });
	}
	var getEndpoint = function(){
		//Get the boolean value if operating live mode or not as well as the possible endpoints for efficiency
		return getSettings(['live_mode', 'endpoint_live', 'endpoint_sandbox'])
		.then(function(vals){		
			//Get the correct endpoint value in the settings if the live mode is true or false
			return vals.live_mode === 1 ? vals.endpoint_live : vals.endpoint_sandbox; 
		});
	}
				
	/******* END SETTINGS FUNCTIONS ********/
	
	/******* START USER FUNCTIONS **********/	
	var authUser = function(un, pw) {
		var hash = CryptoJS.SHA256(pw).toString(CryptoJS.enc.Base64);
		return getFrom(un, STORE.users)
			.then(function(u) { 
				if(u.password == hash)
				{
					u.password = pw; //set pass back to plain text so we can login to server later
					return u;
				}
				else
					return 'Invalid username or password';			
			},
			function() { 
				return 'Invalid username or password'; 
		});
	}
	/******* END USER FUNCTIONS **********/		
	
	/********** START MERCH FUNCTIONS ********/
	var getMerchBySku = function(sku) { 
		if(typeof sku != "string")
			throw "Merchandise SKU must be a string";

		var def = $.Deferred();
		if(sku.length)	
		{
			var index = db.transaction([STORE.merch], "readonly").objectStore([STORE.merch]).index("sku");
			var request = index.get(sku);

			request.onsuccess = function(e){ def.resolve( e.target.result ); };
			request.onerror = function(e){ def.reject(e); };
		}
		
		return def.promise();
	}
	/********** END MERCH FUNCTIONS ********/
	
	/********** START SESSION FUNCTIONS ********/
	var setCurrentSession = function(session, user){

		//This will create a new session object and store it and set it as the current session
		if(session != undefined)
		{
			CE.log.debug('Trying to set the current session, ' + session + ", for user, " + user.username );		
				
			var def = $.Deferred();
			var trans = db.transaction([STORE.session, STORE.settings], "readwrite");
			var os = trans.objectStore([STORE.session]);
			var request = os.add( {"session": session, "permissions": user.permissions, "user": user.username} );
			
			request.onsuccess = function(result) {  
				CE.log.debug("Successful in setting the current session");
				var sessionPromise = CE.DB.settings.put('current_session', result.target.result);

				sessionPromise.done( function(e) { def.resolve(e); });
				sessionPromise.fail( function(e) { def.reject(e);  });
			}
			request.onerror = function(e) { def.reject(e); };
			
			return def.promise();
		}
		//If the session is undefined, we will log out the current user
		else 
		{
			CE.log.warn("The current session has been cleared");
			
			//To log out the user on the client side, we only need to clear the current session in the settings
			return CE.DB.settings.put('current_session');
		}
	}
	
	var getCurrentSession = function(){
		return CE.DB.settings.get('current_session')
			.then(function(vals) { 
				//Make sure we have a good current session id
				if(vals && vals.current_session)
					return CE.DB.session.get(vals.current_session)
						.then(function(session){
							//Make sure we are not giving a the current session 
							//if it is marked as logged out
							if(session.logout)
							{
								CE.log.warn("Tried to use a current session that was logged out.");
								return $.Deferred().reject();
							}
							else
							{
								CE.log.debug("Sucessfully resolved request for current session");
								return session;
							}
						});
			});
	}
	
	/*
	 * This session marks the session as logged out as well as
	 * removing the reference from the current session key in the settings
	 */
	var logout = function(){
		//Get the current session
		return CE.DB.session.getCurrent()
			.then(function(session){
				//Mark it as logged out
				session.logout = new Date().getTime();	
				
				return $.when(
					//Update the logged out session
					putAllInto([session], STORE.session), 
					
					//Update settings to not have a current session
					CE.DB.session.setCurrent()
				);
			});
	}
	
	/*
	 * This method takes a live salesforce session id and a local session id
	 * and upadates the local records to reflect that the session is live and
	 * has been approved. 
	 */
	var makeSessionOnline = function(id, ssid) { 
		var def = $.Deferred();
		
		//We do not need "readwrite", we only need "read". When using "read" chrome was throwing a type error. 
		//This is all I've found to solve it. 
		var os = db.transaction([STORE.session], "readwrite").objectStore(STORE.session);
		
		//Get the old offline session
		var request = os.get(id);
		
		//When it is done, replace some fields and save it again
		request.onsuccess = function(e) { 
			var session = e.target.result;
			
			//Copy the original session info to a new child object
			session.local = session.session;
			
			//But remove the password for security measures
			session.local.password = '<removed>';
			
			//Add the salesforce live session id
			session.session = ssid;
			
			CE.log.info("The session with local id: " + id + ", has been updated to use the live session id: " + ssid);
			
			//overwrite the old session object
			putAllInto([session], STORE.session).then(
				function(e){ def.resolve(e); },
				function(e){ def.reject(e);  }
			); 
		};
		
		request.onerror = function(e){ 
			CE.log.error("Could not retrieve an offline session to update it with an online session id. Local id: " + id);
			def.reject(e);  
		};
		
		return def.promise();
	}
	/********** END SESSION FUNCTIONS ********/
	
	/******** START TRANSACTIONS FUNCTIONS ***********/
	var saveTransaction = function(trans) { 
		var def = $.Deferred();
		var os = db.transaction([STORE.sales], "readwrite").objectStore(STORE.sales);
		var request = os.add(trans);

		request.onsuccess = function(e) { 
			// e.target.result is local id of new transaction
			def.resolve( e.target.result );
		}
		
		request.onerror = function(e) { def.reject(e); };
		
		return def.promise();
	}
	
	var voidTransaction = function(trans_id){
		return getFrom(trans_id, STORE.sales).then(function(trans){
			//Change the upload time to -1.
			//Only uploaded = 0 are looked for to upload
			trans.uploaded = -1;
			
			//Write a message to debugger..... if necessary :)
			trans.voided = "Void. Never submitted to SalesForce.";
			
			//Save the updated transaction
			return putAllInto([trans], STORE.sales);
		});
	}
	
	var updateTransactions = function(processTransactionResponses){
		CE.log.debug("Updating transaction");
		
		//Will hold all of the local transaction ids
		var local_ids = [];

		//The 'transactions' is a array
		for(var i in processTransactionResponses)
			 //Convert the id to a number so it can be searched for
			local_ids.push( Number(processTransactionResponses[i].local_id) );

		//Get the transactions so we can update them
		return getFrom(local_ids, STORE.sales, null, true).then(	
			function(vals){
				var toUpdate = [];
				
				//We now have two different arrays and need to find
				//the items where the local id matches. 
				//Loop through both and have an if statments
				for(var i in vals)
					for(var j in processTransactionResponses)
						if(vals[i].local_id == processTransactionResponses[j].local_id)						
						{
							//Set the salesforce id for the transaction
							vals[i].id = processTransactionResponses[j].transaction_id;
							
							//The field, uploaded, refers to the time it was uploaded. 
							//It will be 0 if it hasnt been uploaded
							vals[i].uploaded = processTransactionResponses[j].upload_time
							
							//Add it to the array to be updated
							toUpdate.push(vals[i]);
						}

				//Update in the database
				return CE.DB.trans.put(toUpdate);
			}, 
			function(e){ 
				CE.log.error("ERROR!!! There was an error trying to update a transaction after it had been uploaded to SalesForce. The transaction will be attempted to be reuploaded causing duplicate results.")	
			}
		);
	}
	/******** END TRANSACTIONS FUNCTIONS ***********/
	
		
	/************** OUTPUT - USABLE FUNCTIONS *************/
	ce_.DB = {
		"reset": resetDb,
		"clear": clearDb,
		"session": {
			"setCurrent": setCurrentSession,
			"getCurrent": getCurrentSession,
			"logout": logout,
			"convert": makeSessionOnline,
			"get": function(list, returnObject) { return getFrom(list, STORE.session, null, returnObject); },
			"permissions": {
				"raw": function() { return CE.DB.session.getCurrent().then( function(session) { return session.permissions; }); },
				"checkPosition": function(pos) { 
					CE.log.info("Checking permissions"); 
					return CE.DB.session.permissions.raw().then( function(perms){ 
						return (perms && perms.length >= pos && perms.charAt(pos) === "1") || typeof perms === "undefined"; 
					}); 
				},
				"sell": function() { return CE.DB.session.permissions.checkPosition(0) },
				"discount": function() { return CE.DB.session.permissions.checkPosition(1) },
				"admin": function() { return CE.DB.session.permissions.checkPosition(2) },
				"department": function() { return CE.DB.session.permissions.checkPosition(3) },
			}
		},
		"accounts": { 
			"get": function(id) { return getFrom(id, STORE.accounts); },
			"put": function(l){  propToLower(l, 'first_name', 'first_name_lc'); propToLower(l, 'last_name', 'last_name_lc'); for(var i in l) l[i].name_lc = l[i].first_name_lc+' '+l[i].last_name_lc; return putAllInto(l, STORE.accounts); },
			"find": {
				"first_name": function(fname){ return search(STORE.accounts, "first_name_lc", fname.toLowerCase()); },
				"last_name": function(lname){ return search(STORE.accounts, "last_name_lc", lname.toLowerCase()); },
				"name": function(name) { return search(STORE.accounts, 'name_lc', name.toLowerCase(), true);  }
			}
		},
		"merch": {
			"put": function(l){ propToLower(l, 'name', 'name_lc'); return putAllInto(l, STORE.merch); },
			"get": function(list) { return getFrom(list, STORE.merch, undefined, true); },
			"bySku": getMerchBySku,
			"clear": function(){ clear(STORE.merch); },
			"find": {
				"sku": function(sku) { return search(STORE.merch, 'sku', [sku, sku.increment(true)] );},
				"name": function(name) { return search(STORE.merch, 'name_lc', name.toLowerCase(), true); }
			}
		},
		"settings": {
			"put": putSettings,
			"get": getSettings,
			"getEndpoint": getEndpoint
		},
		"prices": {
			"put" : function(list){ return putAllInto(list, STORE.tiers); },
			"all": function() { return getAllFrom(STORE.tiers);  },
			"clear": function(){ return clear(STORE.tiers); }
		},
		"users": {
			"put": function(list){ propToLower(list, "username"); return putAllInto(list, STORE.users); },
			"authenticate": authUser,
			"get": function(un) { if(un) return getFrom( un.toLowerCase(), STORE.users); },
			"current": function() { return CE.DB.session.getCurrent().then(function(session) {return CE.DB.users.get(session.username);} ); }
		},
		"trans": {
			"save": saveTransaction,
			"update": updateTransactions,
			"put": function(list){ return putAllInto(list, STORE.sales); },
			"get": function(id) { return getFrom(id, STORE.sales);  },
			"getNew": function() { return search(STORE.sales, 'uploaded', [0,1]); },
			"voidTrans" : voidTransaction
		},
		"promise": dbReadyPromise
	}
	
	return ce_;
	
})(CE || {});