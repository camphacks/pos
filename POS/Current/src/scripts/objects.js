//Defaults to true since we assume there will be a connection. If no connection is available it will be set to false
var navigatorOnLine = false;
var tmp = $.ajax("https://campeagle.org/index.php")
	.done(function()
	{
		navigatorOnLine = true;
	})
	.fail(function()
	{
		navigatorOnLine = false;
	})

function Account(mod, id, evt_id, amt, fname, lname, gender, dob, evt_name, evt_start, evt_end){
	this.mod_time = mod;
	this.id = id;
	//this.event_id = evt_id;
	this.amount = amt;
	this.first_name = fname;
	this.last_name = lname;
	this.gender = gender;
	this.birth_date = dob;
	//this.event_name = evt_name;
	//this.event_start_date = evt_start;
	//this.event_end_date = evt_end;
}

Account.prototype.upsert = function(){
	if(CE && CE.DB && CE.DB.upsertAccounts)
		CE.DB.upsertAccounts([this]);
}

/**** START PAYMENT TYPE OBJECTS ****/
function CreditCardPayment(amount, name, type, ccnum, exp, track1, track2){
	this.amount = amount;
	this.name = name;
	this.card_type = type;
	this.card_number = ccnum;
	this.expiration_date = exp;
	this.track_1 = track1;
	this.track_2 = track2;
}

function CheckPayment(amt, num, dl){
	this.amount = amt;
	this.check_number = num;
	this.drivers_license = dl;
}

function CashPayment(amt){
	this.amount = amt;
}

function AccountPayment(amt, acct){
	this.amount = amt;
	this.camp_account_id = acct;
}

function DepartmentPayment(dep) { 
	this.amount = amt;
	this.department = dep;
}

/**** END PAYMENT TYPE OBJECTS ****/

/* START SALE */
function TransactionRequest(isReturn, tenders, total, items, tier, invoiceNumber, mac, em){
	this.transaction_type = isReturn ? 'return' : 'sale';
	this.uploaded = 0;
	this.line_items = [];	
	this.payment = tenders;
	this.price_book_id = tier;
	this.transaction_date = new Date().getTime();
	this.total = total;
	this.invoice = invoiceNumber;
	
	this.machine = mac; // TIM: added for segregating G2 / CE transactions
	this.email = em; // TIM: added for email receipts
	
	items = items || [];	
	for(var i in items)
		if(items[i] instanceof LineItem)
			this.line_items.push(items[i]);
}


TransactionRequest.prototype.setLocalId = function(lid) { 
	if(lid)
		this.local_id = lid;
	else
		delete this.local_id;
}

TransactionRequest.prototype.setSsid = function(ssid) { 
	if(ssid)
		this.ssid = ssid;
	else
		delete this.ssid;
}

TransactionRequest.prototype.addItem = function(i){
	if(i instanceof "LineItem") 
		this.line_items.push(i);
}
/* END SALE */

function LineItem(merch, qty, pbeid, amt, disc, name){
	this.merchandise_id = merch;
	this.quantity = qty;
	this.price_book_entry_id = pbeid;
	this.amount = amt;
	this.discount = disc || 0;
	this.name = name;
}

function LocalSession(user){
	this.user_id = user.id;
	this.username = user.username;
	this.password = user.password;
	this.login_time = new Date().toISOString();
}

/* REQUEST OBJECTES */
function PointOfSaleRequest(ssid, req){
	this.request = {};
	this.request["session"] = ssid;
	this.setRequest(req);
}

PointOfSaleRequest.prototype.setRequest = function(req) { 
	this.request = this.request || {};
	if(req)
		this.request[req.constructor.name] = req;	
}

function IsAliveRequest() {  }

function LogEntry(cat, sev, msg, val, stack){
	this.category__c  = cat;
	this.time_stamp__c = new Date().toISOString();
	this.severity__c  = sev;
	this.message__c   = msg;
	this.stack_trace__c = stack;
	
	if(typeof val !== "undefined")
	{
		this.value__c = JSON.stringify(val);
	}
}

LogEntry.prototype.toString = function(){
	
	return this.time_stamp__c + " | " + this.category__c + " - " + this.severity__c + "> " + this.message__c + (this.value__c ? "\n" + this.value__c : "");
}

function LoginRequest(un, pw, mac, time, convert){
	this.username = un;
	this.password = pw;
	this.machine = mac;
	this.login_time = time || new Date().toISOString();
	this.is_convert = !!convert;
}

function LogoutRequest(){
	this.logout_time = new Date().toISOString();
}

function EndDayRequest(){
	
}

function GetMonthRequest(m, y){
	this.month = m;
	this.year = y;
}

function SynchronizationRequest(last, sales, justaccounts)
{
	this.last_sync = last;
	this.transactions = sales;
	this.justCampAccounts = justaccounts;
}

function ConfigureRequest(macid) {
	this.machine_id = macid;
}

$.fn.extend({
	addError: function(title){
		var $err = $('<div class="errorMsg"></div>');
		$err.append('<strong>Error:</strong>');
		$err.append('&nbsp;' + title);
		$(this).after($err);
	}
});
	
String.prototype.to = function(type) {
	switch( type )
	{
		case "float" : 
			return parseFloat(this);
		
		case "int" :
			return parseInt(this, 10);
			
		case "boolean" : 
			return new Boolean( this );
			
		case "string":
		default: 
			return this.toString();
	}
}
	
String.prototype.startsWith = function (str){
	return this.indexOf(str) == 0;
};

String.prototype.substringBefore = function(str) { 
	return this.split(str)[0];
};

String.prototype.substringAfter = function(str) { 
	var s = this.split('str');
	return s.length == 0 ? '' : s[1];
};

String.prototype.substringBetween = function(s1, s2) {
	return this.substringAfter(s1).substringBefore(s2);
}

String.prototype.left = function(num){
	return this.substring(0, num);
}

String.prototype.right = function(num){
	if(!this || this.length == 0 || !num || num <= 0) return '';
	return this.substring(this.length - num, this.length);
}

String.prototype.increment = function(numOnly){
	if(numOnly)
		return (Number(this) + 1).toString().padLeft(this.length, '0');
	if(this.length)
		return this.substring(0, this.length-1) + String.fromCharCode(this.charCodeAt(this.length-1)+1);
	return this;
};

String.prototype.decrement = function(){
	if(this.length)
		return this.substring(0, this.length-1) + String.fromCharCode(this.charCodeAt(this.length-1)-1);
	return this;
}

String.prototype.bool = function() {
    return (/^true$/i).test(this);
};

String.prototype.containsAllWords = function(str){
	var arr = str.split(' ');
	for(var i in arr)
		if( this.indexOf(arr[i]) == -1 )
			return false;
	return true;
}

String.prototype.isNumeric = function() { 
	return /^\d+$/.test(this);
}

String.prototype.getNumeric = function() { 
	var num = this.match(/\d+\.?\d*/g);
	if(num && num.length)
		return num[0].toString();
	return "";
}

String.prototype.padLeft = function(length, padStr) { 
	var str = this, ch = padStr || ' ';	
	while(str.length < length){ str = ch + str;	}
	return str.toString();
}

String.prototype.padRight = function(length, padStr) { 
	var str = this, ch = padStr || ' ';	
	while(str.length < length){ str = str + ch;	}
	return str.toString();
}

String.prototype.removeLine = function(){
	var str = this;
	return str.slice(str.indexOf("\n")+1, str.length);
}

String.prototype.capitalize = function(){
	var str = this;
	return str.charAt(0).toUpperCase() + str.substring(1);
}

Date.prototype.pretty = function(time) { 
	return (this.getUTCMonth() + 1) + '/' +  this.getUTCDate() + '/' + this.getUTCFullYear() + (time ? ' ' + this.getUTCHours() + ':' + this.getUTCMinutes() + ':' + this.getUTCSeconds() : '') ;
}

Number.prototype.money = function(){
	return (this < 0 ? '-' : "") + "$" + this.toFixed(2);
}
