/** 
 * Author: Joel Jeske
 *
 * This module adds the POS object to the CE global object.
 * POS is designed to communicate with the salesforce server.
 * This should be the only file communicating externally.
 * This file makes calls to the local database and stores information
 * and retrieves information when necessary.
 * 
 * Dependencies:
 *	CE.util
 *	CE.DB
 *
 * By making calls to the following methods, a driver function can 
 * acomplish transactions and synchronization and logins.
 *
 *	
 *	METHOD: sync 
 *	USAGE: CE.POS.sync();
 *	RETURNS: jQuery Deferred Promise
 *	If this method is called when offline, it resolves immediately 
 *	with no parameters.
 *	This method syncs and stores the responses with salesforce
 *
 *
 *	METHOD: transaction
 *	USAGE: CE.POS.transaction(amount, items, tenders, isReturn, tier);
 *	PARAMETERS:
 *		amount: float (total of transaction)
 *		items: array (list of merchandise from table with quantity)
 * 		tenders: object (set of payment tenders)
 * 		isReturn: boolean (flag if transaction is a return)
 * 		tier: string (the salesforce id of the pricebook being used)
 *	RETURNS: jQuery Deferred Promise
 *  This method processes a transaction with salesforce.
 *	It is responsible for saving the transaction and adjusting the stock
 * 	and the camp account values that may have been used in this transaction
 *
 *
 *	METHOD: isAlive
 *	USAGE CE.POS.isAlive();
 * 	RETURNS: jQuery Deferred Promise
 *	This method checks the accessability of the salesforce server
 *
 *
 *	METHOD: login
 *	USAGE: CE.POS.login(username, password);
 *	PARAMETERS:
 *		username: string (username for account)
 *		password: string (password for account)
 *	RETURN: jQuery Deferred Promise
 *	This method attempts to authenticate a user.
 *	If online when called, it sends the username and password to the 
 *	salesforce server. The server sends a session token in response to a 
 *	successful authentication.
 *	If offline when called, it hashes the password and verifies it matches
 * 	the hash in the local database. Then it listens for network access and 
 *	attempts to reverify the account using the salesforce server.
 *
 *	logout
 *	configure
 *
 */ 
var CE = (function(ce_){
	"use strict";
	
	
	/**
		The Salesforce Server End Point
		Must change to live endpoint before production
	 */

	var sync = function(isAll, justAccounts){
		CE.log.info("Synchronize started. Should sync all: ", isAll);
		
		//If browser is offline, quit and log the failed trye
		//if(!navigator.onLine)
		if(!navigatorOnLine)
		{
			CE.log.warn("Currently offline. Quitting sync.");
			
			//Resolve immediately with no return
			return $.Deferred().resolve();
		}
		
		//Get all the offline transactions to send in the sync
		var transPromise = getOfflineTrans();
		
		//Get the time of the last sync
		var settingsPromise = CE.DB.settings.get('last_sync');
		
		//Get the session object that is currently used for logging in
		var sessionPromise =  CE.DB.session.getCurrent();
		
		//This is the function that will handle the finish of all of the above promises
		function submitSync(vals, session, transactions) {
			CE.log.debug("SYNC. Received values from settings: ", vals);
			CE.log.debug("SYNC. Received current session information: ", session);
			CE.log.debug("SYNC. Received saved transaction: ", transactions);
			
			var last_sync = isAll ? 1 : (vals.last_sync || 1);
			var ssid = session.session;
			
			var action = 'Synchronization';
			var req = new SynchronizationRequest(last_sync, transactions, justAccounts);
			var request = new PointOfSaleRequest(ssid, req);

			return sforcePost(action, request).then(  
	 			function(result){ 
	 				return $.when( storeSyncResponse(result.response), CE.DB.settings.put("last_sync", new Date().getTime()) ); 
	 			},
				function(error){ 
					console.log("TODO: Implement syncronize failure handler");
					console.log(error);
					// TIM: BIGGEST SHOW STOPPING ERROR
					//throw "TODO: Implement syncronize failure handler";
					//return error;
					
					return $.when( CE.DB.settings.put("last_sync", new Date().getTime()) );
				}
			);
		}
		
		/* When the last sync time and the current session is retrireved from the database, then submit the sync */
		return $.when(settingsPromise, sessionPromise, transPromise  ).then(submitSync, function(e){ CE.log.error("Error getting objects needed for sync.", e); } );
	}
	
	//This is the handler when the sync is returned from salesforce
	function storeSyncResponse(response) {
		//Check if there is a response
		if(response)
		{
			if(response.merchandise)
				CE.DB.merch.put(response.merchandise);

			if(response.price_books)
				CE.DB.prices.put(response.price_books);
				
			if(response.users)
				CE.DB.users.put(response.users);
				
			if(response.camp_accounts)
				CE.DB.accounts.put(response.camp_accounts);
			
			//If we have results from transactions
			if(response.transaction_results)
				CE.DB.trans.update( response.transaction_results );	//Update all the transactions
		}
	}
	
	/*
	 * This is used when the user tries to login.
	 * It handles online and offline attempts.
	 */
	var login = function(un, pw){
		//If we are online
		//if(navigator.onLine)
		if(navigatorOnLine)
		{
			//Setup request info
			var action = 'Login';
			var request = new PointOfSaleRequest();
			
			//Wait for the machine id from the settings
			return CE.DB.settings.get('machine_id')
				.then(function(vals) { 
							
					//Make the login request object and add it to our POST request object
					request.setRequest( new LoginRequest(un, pw, vals.machine_id) );
					
					//Wait for the post to resolve
					var postRequest = sforcePost(action, request, true);
					
					//Also try to get the user from the database.
					var userRequest = CE.DB.users.get(un, true)
										.then(null, function(){ 
											return $.Deferred().resolve( {} );
										});
										
					return $.when(postRequest, userRequest)
						//Then they are both done,
						.then(
							function(post, user){ 
								//Set the session as current
								return CE.DB.session.setCurrent(post.response.session, user);
							},
							function(post,user){ 
								//Mark the errors.
								//TODO: Failure handling. 
								CE.log.error("Failed trying to login", post);
								CE.log.error("Failed trying to login", user);
								//var str = JSON.stringify(post).replace(/\n/g,'\\n').replace(/\\n/g, ' ');
								//str = str.replace('"[', '[').replace(']"',']');
								var str = JSON.stringify(post);
								var obj = JSON.parse(str);
								console.log('fail: ' + obj.messages[0].message);
								CE.util.alert('FROM SFORCE', obj.messages[0].message);
								/*console.log('fail: ' + str);
								console.log('fail2: ')
								console.log(obj);*/
							}
						);	
				});
		}
		else //offline authentication
		{
			
			return CE.DB.users.authenticate(un, pw)
				.then( function(user) { 
					var sessionPromise = CE.DB.session.setCurrent(new LocalSession(user), user);
					listenForNetwork();
					return;
				}); 
		}
	}
	
	/*
	 * This metho places a listener on the ononline event. When receiving access, 
	 * it waits 10 seconds and then trys to convert the session and then sync.
	 */
	function listenForNetwork(){
	
		function checkConnection(){
			//if(navigator.onLine)
			if(navigatorOnLine)
			{
				isAlive()
				.done(function(){
					CE.log.info("We have internet access after being offline.");
				
					//Make sure we have a good converted session
					CE.DB.session.getCurrent().then(convertSession).done(function(){
						//Then try to sync
						CE.POS.sync();
					});
				})
				.fail(function(){
					//Try again if failed in 2 seconds
					window.setTimeout(checkConnection, 2000);
				});
			}
		}				
		
		//Attempt to connect when we receive our event
		window.ononline = checkConnection;
	}
	
	/*
	 * This method takes a session object as stored in the local db. 
	 * If it is a string, we assume it is a SalesForce session id and resolve immediately with it.
	 * Otherwise, we try to make a login request to make it into a live session id. 
	 *We tore the 
	 */
	function convertSession(session){ 
		console.log('in session: ' );
		console.log(session);
		console.log(typeof session.session);
		console.log(typeof session.session == "string");
		//Resolves immediately if already a live session id
		if(typeof session.session == "string") 
		{
			//Resolve immediately with the session token
			return $.Deferred().resolve(session.session);
		}
		else
		{
			CE.DB.session.getCurrent().then(function(currsession){ 
				return CE.DB.users.get(currsession.user);
			}).done(function(curruser) { 
				console.log('got user:');
				console.log(curruser);
				
				//Get the machine id from the settings
				return CE.DB.settings.get('machine_id').then(function(machine) { 
				
					console.log('trying to convert session: ');
					console.log(session);
					console.log('current user:');
					console.log(curruser);
					
					//Make a login reuqest from the session 
					var action = 'Login';
					//var login_req = new LoginRequest(session.session.username, session.session.password, machine.machine_id, session.session.login_time, true);
					var login_req = new LoginRequest(curruser.username, curruser.password, machine.machine_id, session.session.login_time, true);
					var request = new PointOfSaleRequest(); // (null, login_req);
					request.setRequest(login_req);
					
					return sforcePost(action, request)
						.then( 
							function(e) { 
								var ssid = e.response.session;
								return CE.DB.session.convert(session.id, ssid).then(function(e) { 
									session.session = ssid;
									return ssid; 
								},
								function(e){ 
									CE.log.error("Failed to store converted session token in the local database.");
								});
							},				
							function(e) { 
								CE.log.error("Failed to convert offline session to an online session. ", e);
								CE.util.alert("Couldn't Login", "The system has tried to log you in automatically since regaining internet access and failed login");
								return e;
							}
						);					
				});
				
			});
			
/*			
			//Get the machine id from the settings
			return CE.DB.settings.get('machine_id').then(function(machine) { 
			
				console.log('trying to convert session: ');
				console.log(session);
				console.log('current user:');
				
				//Make a login reuqest from the session 
				var action = 'Login';
				var login_req = new LoginRequest(session.session.username, session.session.password, machine.machine_id, session.session.login_time, true);
				var request = new PointOfSaleRequest(); // (null, login_req);
				request.setRequest(login_req);
				
				return sforcePost(action, request)
					.then( 
						function(e) { 
							var ssid = e.response.session;
							return CE.DB.session.convert(session.id, ssid).then(function(e) { 
								session.session = ssid;
								return ssid; 
							},
							function(e){ 
								CE.log.error("Failed to store converted session token in the local database.");
							});
						},				
						function(e) { 
							CE.log.error("Failed to convert offline session to an online session. ", e);
							CE.util.alert("Couldn't Login", "The system has tried to log you in automatically since regaining internet access and failed login");
							return e;
						}
					);					
			});
		*/
		}
	}
	
	/*
	 * Returns a promise that will resolve to an object.
	 * The object will look like
		 { 
		 	ssid_1 : [
		 		trans_1, 
		 		trans_2
		 	], 
		 	ssid_2 : [
		 		trans_3
		 	], 
		 	... 
		 }
	 * 
	 * All of the transactions will be needed to be uploaded. They probably occurred when 
	 * we were offline. 
	 */
	function getOfflineTrans(){
		CE.log.info('We are getting all transactions that have not been uploaded to SalesForce. This is denoted by transaction.upload == 0.');
		return CE.DB.trans.getNew().then(function(trans){
			
			//This will hold al of the session ids during which the transactions were made. 
			//The Sessions must be made online before sending off the transactions. 
			var sessionIds = [];
			
			console.log('trans:');
			console.log(trans);
			
			//Loop through all the transactions and get the sesssion ids
			for(var i in trans)
				sessionIds.push( trans[i].ssid );
			
			//if there are any transactions
			if(sessionIds.length) 
			{
				//Get all the session tokens
				//when we have the list of sessions for all the transactions
				return CE.DB.session.get( sessionIds, true ).then( function(sessions) { 
					console.log('AFTER session.get using ' + JSON.stringify(sessionIds));
					console.log(sessions);
					//Will hold a list of all the convert session promises
					var promises = []; 
					CE.log.info("We have " + trans.length + " transactions with " + Object.keys(sessions).length + " sessions. We are going to make sure they are all live sessions.");
					
					for(var i in sessions)
					{
						//Convert all the sessions and save the promises so we know when they are all done.
						promises.push( convertSession(sessions[i]) ); 
					}
					
					//When all the sessions have been converted
					return $.when.apply($, promises).then(function() { 
						//Will hold a map of the session id to a list of transactions
						//WILL LOOK LIKE: { ssid_1 : [tran_1, tran_2], ssid_2 : [tran_3], ... }
						var sessionMap = {};
						
						for(var i in trans)
							for(var j in sessions) //sessions have all been converted and now have the result
								if(trans[i].ssid == sessions[j].id) //find the session object for each transaction
								{
									//Initialzie to [] if needed.
									//This list will hold all of the transactions for the session denoted by the map key
									if(!sessionMap[ sessions[j].session ])
										 sessionMap[ sessions[j].session ] = []; 
									
									//Remove the key from the transaction object becuase it doesnt need to be in our 
									//sessionMap and we are not using the 'trans' object anymore.
									delete trans[i].ssid; 
									
									//Add the transaction to the transaction list.
									//build a map as follows - { ssid_1 : [tran_1, tran_2], ssid_2 : [tran_3], ... }
									sessionMap[ sessions[j].session ].push( trans[i] ); 
								}
								
						//This will resolve to our caller		
						return sessionMap;
					});
				});
			}
			//If there are no sessionIDs
			else
			{
				//Return an empty object if there are no pending transactions and
				//hence no session that need to be converted.
				return {};
			}
		});
	}
	
	var endDay = function(){
		CE.log.info("Starting to end the current 'day'");
		
		var promise = CE.DB.session.getCurrent().then(function(session){
			//If we have the session ready, 
			if(session && session.session)
			{	
				//Setup the request parameters
				var action = "EndDay";
				var request = new PointOfSaleRequest(session.session, new EndDayRequest());
				
				//Make the request
				return sforcePost(action, request);
			}
			else
			{
				return $.Deffered().reject();
			}
		});
		
		return promise;
	}
	
	var getMonth = function(month, year){
		CE.log.info("Starting get month", {
			year: year,
			month: month
		});
		
		var promise = CE.DB.session.getCurrent().then(function(session){
			//If we have the session ready, 
			if(session && session.session)
			{	
				//Setup the request parameters
				var action = "GetMonth";
				var request = new PointOfSaleRequest(session.session, new GetMonthRequest(month, year));
				
				//Make the request
				return sforcePost(action, request);
			}
			else
			{
				return $.Deffered().reject();
			}
		});
		
		return promise;
		
	}
	
	/*
	 * This function tells salesforce that they are logging out. 
	 * It also clears the session pointer referring to the current pointer.
	 */
	var logout = function() {
		//Get the current session
		var sessionPromise = CE.DB.session.getCurrent();
		
		return sessionPromise.then(
			function(session){
				if(session && session.session)
				{	
					//Setup the request parameters
					var action = "Logout";
					var request = new PointOfSaleRequest(session.session, new LogoutRequest());
	
					//Send the Request to logout and then 
					//remove the current session token by calling the setCurrent 
					//method with no arguments
					return sforcePost(action, request).then(function(){ CE.DB.session.logout(); });
				}
				else
				{
					CE.log.warn("Tried to logout without a current session! Session was deleted without logging out");
					return CE.DB.session.logout();
				}
		});
	}
	
	/* 
	 * This method is the heart method of this file. 
	 * It is responsible for every call to SalesForce. 
	 * Pass in a string: action to be used as the method endpoint. 
	 * Pass in an object: request that will be JSON encoded and used as the POST body
	 */
	function sforcePost(action, request, hideError){
		CE.log.info("Starting HTTP POST communication with SalesForce. Using method: " + action);
		
		//The deffered object that will resolve when the post request completes
		var def = $.Deferred();

		//if( !navigator.onLine )
		if(!navigatorOnLine)
		{
			CE.log.warn("Quitting POST becuase we are currently offline.");
			return def.resolve();
		}
		
		//Get all the current logs as an array and put it as a sibling object with request
		request.logs = logger.getLogs(); 

		CE.DB.settings.getEndpoint().done(function(EP){
			
			//Create the URL from the salesforce endpoint and the action appended 	
			var url = EP + action; 
			
			//Make a string of the request to send easily
			var req = JSON.stringify(request); 
			
			//Also log to the console for easy access
			console.log(request);
			
			$.ajax({
				type: "POST",
				url: url,
				data: req,
				dataType: "json",
				contentType: "application/json;charset=UTF-8",
				success: function(e){ 
					//The logs were received so we can clear them here
					//We know the logs were received even if the application had an error. 
					//The only way the logs would not be received was if 
					logger.resetLogs();
	
					if(e.responseCode == "OK") 
					{
						//Tell our caller that we have completed sucessfully
						def.resolve(e);  
					}
					else 
					{ 
						//Tell our caller that we have had an application error but our post completed sucessfully
						def.reject(e); 
						
						//Show the standard POST error message
						if(!hideError)
							alertPostError(e); 
					}
					
					// If the server says a sync is needed, then sync.
					if(e.synchronizationNeeded)
					{
						sync();
					}
				},
				error: function(e){ 
					//This will occur if the HTTP POST did not complete for any reason. 
					//Further implementation of this method can handle failure causes.
					catchPostError(e, url); 
					
					//Tell our caller that we have had an HTTP POST error.
					def.reject(e); 
				}
			}); 
			
		});		
		
		return def.promise();
	}
	
	/* 
	 * Catches and alerts the user of an HTTP or POST error that occurred, not a POS application error
	 */
	function catchPostError(e, url)
	{
		// decipher e to determine real error message.
		
		//console.log('IN CATCH POST ERROR: ' + e);
		//for(var i in e)
		//	console.log('e['+i+']: ' + e[i]);
		var resp = e.responseText;
		//console.log('text: ' + resp);
		var respJSON = e.responseJSON;
		var j = [];
		if(respJSON)
		{
			if(respJSON.length > 0)
				j = respJSON[0];
			for(var i in j)
			{
				if(i == 'message')
				{
					if(j[i].search('pricebook entry is in a different pricebook than the one assigned to the opportunity') >= 0)
						CE.util.alert('Error', 'One of the items you are trying to sell is set up incorrectly. Please remove some items from the order and try again.');
				}
			}
		}
		//var str = resp.replace(/\n/g,'\\n').replace(/\\n/g, ' ');
		//str = str.replace('"[', '[').replace(']"',']');
		//var obj = JSON.parse(str);
		//CE.util.alert('Error', obj.responseJSON[0].message);
		//CE.util.alert('Error', e.responseJSON[0].message);
		//CE.util.alert('Error', 'There was an error while communicating with SalesForce');
		CE.log.error("POST error" + (url?" on " + url: ""), e);
	}
	
	/*
	 * Alerts the user of a POS application error that occurred during 
	 */
	function alertPostError(resp) {
		//If there really are messages to display
		if( resp.messages && resp.messages.length)
		{
			//Will hold the string for the html to be used on the ALERT dialog box
			var alertBody = '';
			
			//Loop through all the error messages
			for(var i in resp.messages)
			{
				//Build a pretty error string
				var msg = 'Error ' + resp.messages[i].code + ': ' + resp.messages[i].message;
				
				//Log the error
				CE.log.error(msg);
				
				//Add the error to be displayed on the alert dialog
				alertBody += msg + '\r\n';
			}
				
			//Show the error alert	
			CE.util.alert('Error', alertBody);
		}
	}
	
	/*
	 * Tests if the POS application can reach the saleforce endpoint successfully. 
	 */
	var isAlive = function() { 
		var action = "IsAlive";
		var request = new PointOfSaleRequest();
		return sforcePost(action, request, true);
	}
	
	/*
	 * Makes a request to salesforce to configure the current machine. 
	 */
	var configure = function(machine_id) { 
		//If we have a machine id then we can try to process the request. 
		//If not, we resolve empty immediately. 
		if(typeof machine_id === "string" && machine_id.length)
		{
			var action = "Configure";
			
			//Get the current session and then make the request with the session token and machine id
			return CE.DB.session.getCurrent()
				.then(function(sess) {	
				
					//Make the request object				
					var request = new PointOfSaleRequest(sess.session, new ConfigureRequest(machine_id) );
					
					//Returns another promise
					var promise = sforcePost(action, request);		
					
					return promise; 
				});
		}
		else
		{
			return $.Deferred().resolve({});
		}
	}
	
	/************ START TRANSACTION METHODS ************/
	/*
	 * amount: float (total of transaction)
	 * items: array (list of merchandise from table with quantity)
	 * tenders: object (set of payment tenders)
	 * isReturn: boolean (flag if transaction is a return)
	 * tier: string (the salesforce id of the pricebook being used)
	 */
	var transaction = function(amount, items, tenders, isReturn, tier, invoice, mac, em){		
		
		/*
			*Make the transaction request*
			
			isReturn: boolean (flag if transaction is a return)
			tenders.payment: the object with all of the chosen payment methods
			amount: the number of dollars of this transactino
			lineItems: the server required format for the line items to be in. Note: this is based on the pricebook (tier) being used
			tier: the string salesforce id of the pricebook used for this transaction
			invoce: the string invoice number
			
			mac: the machine_id
			em: email address for receipt (if there is one)
		 */
		var sale = new TransactionRequest(isReturn, tenders.payment, amount, makeLineItems(items, tier), tier, invoice, mac, em);

		//Make a copy of it. Reference issues when changing the transaction during the save. (removing CC info)
		var copy = JSON.parse(JSON.stringify(sale))
		
		//Save a local copy of the transaction
		var savePromise = storeLocalSale(copy); 
		
		//Only if we have internet access
		//if(navigator.onLine)
		if(navigatorOnLine)
		{
			//Get the settings and make sure it is an online session
			var sessionPromise = CE.DB.session.getCurrent().then(function(s) { return convertSession(s) }); //converts session if necessary

			//When we have our session and our local copy is stored, 
			return $.when(savePromise, sessionPromise)
				.then(
				function(sale_id, ssid) { 

					//Get our parameters ready to send to the server
					var action = "ProcessTransaction";			
					sale.setLocalId(sale_id);	//set local sale id on sale for transmit;
					var request = new PointOfSaleRequest(ssid, sale); //make the request object
					
					//Make the request
					var postPromise = sforcePost(action, request, true); 

					//FAILURE HANDLER
					postPromise.fail(function(){
						//Before we sent our POST transaction, we added the sale to the local database. 						
						CE.DB.trans.voidTrans(sale_id);
					});
					
					//This will ALWAYS return the local sale id regardless of success/failure.
					return postPromise.then( function(e) { 
						//Clear out the sale object as it make have sensitive information store in it (CC info)
						sale = undefined;
						
						//Update the stored transaction to have the salesforce opportunity id and mark it as uploaded 
						var promise1 = updateLocalTransaction( e.response );
						
						//Update our stock and camp account amounts
						var promise2 = logTransactionEffects(copy); 
						
						return $.when(promise1, promise2);
					})
					.then(function(){ 
						//Return the sale id so whoever calls the the functions 'transaction' will resolve with the sale id
						return sale_id; 
					});
					
				});
		}
		else
		{
			//Adjust our stock and camp accounts amounts
			logTransactionEffects(copy); 
			
			//Make sure we are listening for network changes so we can upload this asap
			listenForNetwork();
			
			//When we are done saving the local copy and alerting the user, we will return the local sal id
			return $.when(
				savePromise,
				CE.util.alert('Offline', 'Your transaction will be submitted when you regain internet access')
			).then(function(sale_id){ return sale_id; });
		}
	}
	
	/*
	 * This method is to update the local copy of the transaction
	 * after we have received a sucessful response from the server.
	 * NOTE: If this method is not called, at the next synchronization,
	 * the transaction will be attempted again. 
	 */
	function updateLocalTransaction(response) {
		//Make a partial transaction object and paritally save over the local object
		return CE.DB.trans.update([response]);
	}
	
	/*
	 * This method is called before the tansaction is sent off to the server. 
	 * It saves the transaction, ready for sending. 
	 */
	function storeLocalSale(sale) { 
		if(sale)
		{
			/* START REMOVE SENSITIVES */
			if(sale.payment && sale.payment.credit_card)	
			{
				sale.payment.credit_card.track_1 = '<removed>';
				sale.payment.credit_card.track_2 = '<removed>';
				sale.payment.credit_card.expiration_month = '<removed>';
				sale.payment.credit_card.expiration_year = '<removed>';
				sale.payment.credit_card.card_number = '************' + sale.payment.credit_card.card_number.right(4);
			}
			/* END REMOVE SENSITIVES */			
			
			return CE.DB.session.getCurrent()
				.then(function(session) { 
					sale.ssid = session.id;
					return CE.DB.trans.save(sale);
				});
		}
		throw 'Invalid sale to save';
	}
	
	/* 
	 * This method is called to change the local copies of stock and camp accounts.
	 */
	function logTransactionEffects(sale) { 
		//This will be a map of the product_stock__c id to the number to subtract from the current stock quantity
		var stockChanges = {};
		
		//Will hold a an array of all the merch id (product_stock__c id)
		var merch = [];
		
		//Boolean value to mark return mode or sale mode
		var isReturn = sale.transaction_type == 'return';
		
		/** START UPDATING LOCAL STOCK **/
		for(var i in sale.line_items)
		{
			//Create the stock amount change
			stockChanges[ sale.line_items[i].merchandise_id ] = sale.line_items[i].quantity * (isReturn ? -1 : 1);
			
			//Add the list of merch id	
			merch.push(  sale.line_items[i].merchandise_id );
		}
		
		//Find all the merch id from the database so we can update the local quantity
		var merchPromise = CE.DB.merch.get(merch)
			.then(
			function(ms){ 
				//If there are merch found
				if(ms)
				{	
					//Will hold an array of all the stock to update
					var toUpdate = [];
				
					//Go through and change the quantity
					for(var id in stockChanges)
					{
						//If the current quantity is not a number, then subtract from zero
						var currentQuantity = isNaN( ms[id].quantity ) ? 0 :  ms[id].quantity;
						
						//Current minus the change
						ms[id].quantity = currentQuantity - stockChanges[id];
						
						//Mark this merch to update
						toUpdate.push( ms[id] );
					}
					
					//Update the merch
					return CE.DB.merch.put(toUpdate);
				}
			},
			function(){
				var e = "Cannot locate merchandise in database during checkout process";
				CE.log.fatal(e);
				return CE.util.alert(e);
			});
			
		/** END UPDATING LOCAL STOCK **/		
		
		/** START UPDATING CAMP ACCOUNT **/
		//If an account payment was used
		var accountPromise;
		if(sale.payment && sale.payment.account)
		{	
			//Get the camp account that was used
			console.log('getting from account...' + sale.payment.account.camp_account_id);
			accountPromise = CE.DB.accounts.get( sale.payment.account.camp_account_id )
				.then(
				function(acct){
					//If an account was found
					if(acct)
					{
						//Returns apply for account. If the sale was a return, make it negative
						var paymentAmount = sale.payment.account.amount * (isReturn ? -1 : 1); 
						
						//ensure recovery from undefined camp balance - assume $0.00
						var currentBalance = (isNaN(acct.amount) ? 0 : acct.amount);
						
						//Subtract the amount from the current balance
						acct.amount = currentBalance - paymentAmount; 
						
						console.log('acct: ');
						console.log(acct);
						//Update the account
						return CE.DB.accounts.put(acct);
					}
				},
				function(){
					var e = "Cannot locate camp account in database during checkout process";
					CE.log.fatal(e);
					return CE.util.alert(e);
				});
		}
		else
		{
			accountPromise = $.Deferred().resolve();
		}
		/** END UPDATING CAMP ACCOUNT **/		
		
		//Finish when these both are done
		return $.when(merchPromise, accountPromise);
	}
	
	function makeLineItems(items, pbid) { 
		var lis = [];
		for(var i in items)
		{
			//Will hold the price used in the for the merch in the sale
			var p;
			
			//Find price from requested price tier
			for(var j in items[i].prices) 
				if(items[i].prices[j].price_book_id == pbid)
					p = items[i].prices[j];
				 
			//If couldnt find price in requested price tier
			//Lets try to use the standard price tier
			if(typeof p == "undefined") 
				for(var j in items[i].prices) //Loop through the prices again
					if( items[i].prices[j].is_default ) //Use the standard price tier
						p = items[i].prices[j]; //Use the price

			//No recovery if requested price tier and standard price tier does not have a price for the item.
			if(typeof p == "undefined") 
			{
				var e = "Invalid line item. No valid prices or standard prices found.";
				CE.log.error(e);
				CE.util.alert(e);
			}
				
			//Create the line item and add it to the array of line items
			lis.push( new LineItem(items[i].id, 
								   items[i].number, 
								   p.price_book_entry_id,
								   p.amount, 
								   items[i].discount,
								   items[i].name ));
		}
		return lis;			
	}
	/************ END TRANSACTION METHODS ************/
	
	/************ START LOGGING METHOD ** *************/
	var logger = (function(){
		//Holds all the logs until they are sent to the server
		var logs = [];
		
		//Holds the current logging level severity as a number
		var loggingLevel;
					
		//The severity number doubles as the index into the array for a pretty value
		var severityText = ["DEBUG", "INFO", "WARNING", "ERROR", "FATAL"];
		
		//Holds the function name to log to the console appropriately (i.e. console.log() or console.warn() or console.error())
		var severityConsoleLogger = ["log", "log", "warn", "error", "error"];
		
		//Holds the logeger object to be returned that methods can be called upon
		var logger_ = {
			//The logging severity enum
			//This represents the severity to compare to logging level
			severity : {
				DEBUG   : 0,
				INFO    : 1,
				WARNING : 2,
				ERROR   : 3,
				FATAL   : 4
			},
		
			//Function to add a new log. Called most commonly
			log : function(sev, cat, msg, val, stack){
				//Are we logging the level requested?
				if(sev >= loggingLevel)
				{					
					//Use the severity number to index into the 
					//severityText array for a pretty indicator
					var sevText = severityText[sev];
									
					//Create a new stack trace
					//Remove 3 lines to get only relevant data
					var stack = "Stack \r\n" + new Error().stack
								.removeLine()
								.removeLine()
								.removeLine()
								.replace(new RegExp(window.top.location.origin, 'g'), '');
						
					// Construct the log entry
					var entry = new LogEntry(cat, sevText, msg, val, stack);
					
					// Show the log entry on the main console
					//Use the console array to show message as a log, error, or warning
					console[severityConsoleLogger[sev]](entry.toString());
						

					// Add the log entry to the stack
					logs.push(entry);					
					
					return entry;
				}
			},
			
			//Method to get all the logs available
			getLogs : function(){
				return logs;
			},
			
			//Method to reset all the logs 
			resetLogs : function(){
				logs = [];
			},
			
			//Function to set a new severity
			setLevel : function(l){
				//Retain the new level requested
				loggingLevel = l;
			}
		};
		
		//Default the severity to DEBUG
		logger_.setLevel(logger_.severity.DEBUG);
	
		//Return the logger object for this module's use
		return logger_;
	})();

	//Setup logger to log the correct level
	logger.setLevel(logger.severity.DEBUG);
	
	/* POS object */	
	ce_.POS = {
		"sync" : sync,
		"transaction" : transaction,
		"isAlive" : isAlive,
		"login" : login,
		"logout": logout,
		"configure" : configure,
		"endDay": endDay,
		"getMonth": getMonth
	}
	
	/* log object */
	ce_.log = {		
		"debug" : function(m,v){logger.log(logger.severity.DEBUG,  "Point of Sale", m,v); },
		"info"  : function(m,v){logger.log(logger.severity.INFO,   "Point of Sale", m,v); },
		"warn"  : function(m,v){logger.log(logger.severity.WARNING,"Point of Sale", m,v); },
		"error" : function(m,v){logger.log(logger.severity.ERROR,  "Point of Sale", m,v); },
		"fatal" : function(m,v){
			var entry = logger.log(logger.severity.FATAL,  "Point of Sale", m,v); 
			if(entry)
				CE.util.alert('Fatal Error!', 'Camp Sales has encountered a fatal error and should be restarted.<br /><br /><h2>' + 
					entry.message__c + 
					'</h2><br />Stack <br />' + 
					entry.stack_trace__c.replace(new RegExp('\n', 'g'), '<br />'));
		},
	}
	
	console.log(Date.now() + ' finished sforce.js');
	return ce_;
})(CE || {});