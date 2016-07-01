var CE = (function(ce_){
	"use strict";
	
	var _failedAttempts = 0;
	
	
	function getUrl(){
		//TODO: Implement mDNS discovery for _qzprint._tcp on local.
		//and use its service and port instead of hard coded.
		return "http://localhost:24543/";
	}
	
	function canFindSerivice(){
		return sendCommand("all_printers", undefined, true).then(function(){return;}, function(){return;});
	}

	/*
	 * Internal function to send a command to the printer hosted page
	 */
	function sendCommand(method, args, supressLogs){
		var ep = getUrl() + method;

		if(!supressLogs)
			CE.log.debug('Talking to QZ using method: ' + method);
		
		return $.ajax({
			type: "POST",
			url: ep,
			data: args,
			contentType: "text/plain",
			success: function(e){ 
				//We ensure the printer is marked as alive
				CE.print.status.isAlive = true;
				_failedAttempts = 0;
				CE.log.info(e);
			},
			error: function(e){
				//We ensure the printer is marked as dead
				CE.print.status.isAlive = false;
				
				//Increment our failed attempts in a row
				_failedAttempts++;

				//We wait for a period and then perform another request again. 
				if(_failedAttempts < 5)
					window.setTimeout(canFindSerivice, 10000);
				
				if(!supressLogs)
					CE.log.error('Error communicating with qz-print. Try restarting the service "QZ Network Print Service" by running \n\nC:\Program Files\Camp Eagle\Print Service\StopQZ-NT.bat \nand \nStartQZ-NT.bat ', e);

			}
		}).promise();
	}
	
	/*
	 * Prints a hex string from a settings key in the DB
	 */
	function printHexFromSettings(settingsKey, immediately){
		//Get the hex code from the settings and convert to the needed hex string and send to the printer

		return CE.DB.settings.get(settingsKey)
		.then(function(vals){
			//If we have the data
			if(vals[settingsKey])
			{
				//Convert to the appropriate Hex string
				var hex = decimalToHex(vals[settingsKey]);

				CE.log.debug("Appending hex to code to next print: " + hex);
				
				var promise = CE.print.appendHex(hex);
				
				if(immediately)
					promise = promise.then(CE.print.print);
					
				return promise; 
			}
			else
			{
				//Return a failing promise
				return $.Deferred().reject();
			}
		});
	}
	
	/*
	 * Converts a decimal, comma separated string to an 'x' separated string as needed for QZ-Print
	 */
	function decimalToHex(val){
		//Will hold the hex data
		var hex;
		var hexArray = [];
		var decimalArray = val.split(",");
		
		for(var i in decimalArray)
		{
			//Convert each data piece into hex and store in the other array
			hexArray.push( parseInt(decimalArray[i], 10).toString(16).toUpperCase() );
		}
		
		//Use 'x' as the hex byte seperator
		hex = "x" + hexArray.join("x");
		
		return hex;
	}
	
	
	
	
	ce_.print = {
		"find"  : function(p){return sendCommand("find_printer", p); },
		"getAll" : function(){return sendCommand("all_printers"); },
		"append" : function(val){return sendCommand("append_raw", val); },
		"append64" : function(val){return sendCommand("append_64", val); },
		"appendHex" : function(val){return sendCommand("append_hex", val); },
		"appendHTML" : function(html){return sendCommand("append_html", html); },
		"print" : function(){return sendCommand("print"); },
		"printPS" : function(){return sendCommand("print_ps"); },
		"printHTML" : function(){return sendCommand("print_html"); },
		"openDrawer" : function(immediately){return printHexFromSettings("drawer_code", immediately); },
		"cutPaper" : function(immediately){return printHexFromSettings("cut_code", immediately); },
		"_send" : sendCommand,
		"status" : {
			"isAlive": false,
		 	"promise": canFindSerivice()
		}
	}
	
	
	return ce_;
	
})(CE || {});