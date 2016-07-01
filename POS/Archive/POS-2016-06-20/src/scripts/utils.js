var RIGHT_CLICK_DISABLED = false;
var CE = (function(ce_) {  
	"use strict";

	var numberKeyCodes = [8,9,16,17,18,33,34,35,36,37,38,39,40,45,46,47,48,49,50,51,52,53,54,55,56,57,96,97,98,99,100,101,102,103,104,105,110,112,113,114,115,116,117,118,119,120,121,122,123,124];
// 110 might be decimal on keypad

	/************ START POPUP WINDOWS *************/
	/** START POPUP QUEUEING  **/
	var popupQueue_ = [];
	var popupOpen_ = false;
	function singletonPopup(name, opts, cb){
		
		var callBack = function(a) { 
			a.onClosed.addListener(popupClosed);
			if(typeof cb == "function") cb(a);
		}
		
		popupQueue_.push({
			name: name,
			opts: opts,
			cb: callBack
		});
		
		checkQueue();
	}
	
	function checkQueue() { 
		if(!popupOpen_ && popupQueue_.length > 0)
		{
			popupOpen_ = true;
			var vals = popupQueue_.shift();
			chrome.app.window.create( vals.name, vals.opts, vals.cb );
		}
	}
	
	function popupClosed() { 
		popupOpen_ = false;
		checkQueue();
	}
	/** END POPUP QUEUEING  **/	
	
	
	var alert = function(title, body, buttonText, cb){
	
		var def = $.Deferred();
		
		var alertOptions = {
			singleton: false,
			resizable: true,
			hidden: false,
			bounds : {
				height: 250,
				width:500
			},
			minWidth: 500,
			minHeight: 250,
			frame: "none"
		};
		
		function setupAlert(win){
			CE.log.debug("Creating alert with title: '" + title + "' and message: '" + body + "'");
			win.contentWindow.data = {};
			win.contentWindow.data.title = title;
			win.contentWindow.data.message = body;
			
			win.contentWindow.console.log("Just received data");
			
			win.contentWindow.addEventListener('load', function() {
				var el = win.contentWindow.document.getElementById("ok");

				if(buttonText)
					el.innerText = buttonText;
				el.addEventListener('click', function() { def.resolve(); });				
			});
			
			if(typeof cb == 'function')
				cb(win);
		}
		
		singletonPopup("alert.html", alertOptions, setupAlert);
		
		return def.promise();
	}
	
	var confirm = function(title, body, buttons) { 
		var def = $.Deferred();
		buttons = buttons || {};
		var promise = 
		CE.util.alert(title, body, buttons.ok, 
			function(win) { 
				win.contentWindow.addEventListener('load', function() { 
					var cancel = win.contentWindow.document.createElement('button');
					cancel.innerText = buttons.cancel || 'Cancel';				
					var ok = win.contentWindow.document.getElementById('ok');
	
					cancel.addEventListener('click', function() { def.reject(); win.close();});
					ok.addEventListener('click', function() { def.resolve(); });		
					
					ok.parentNode.insertBefore(cancel, ok);	
				})
			});
		
		return def.promise();
	}
	/************ END POPUP WINDOWS *************/

	
	var hotkeys = {
		keymap : {},
		setupHotkeys: function() {
			CE.log.info('This page is using hotkeys.');
			
			$('.hotkey key').each(function() { 
				var kc = parseInt( $(this).attr('data-code') );
				hotkeys.keymap[kc] = $(this).parent();
			});
			
			$(document).keydown(function(e) { 
				var el = hotkeys.keymap[e.which];
				if(el && !el.hasClass('disabled'))
					el[0].click();
			});
		}
	}
	
	var buildFormObject = function($e) {  
		var val = {};
		var name = $e.attr('data-name');
		
		var tag = $e.prop('tagName').toUpperCase();
		if( tag == 'INPUT' || tag == "TEXTAREA" || tag == "SELECT"  ) //is leaf
		{
			var type = $e.attr('data-type');
			var value = $e.val().to( type );

			val[ name ] = value;
			return val;
		}
		else
		{
			$e.children().each(function() { 
				var rets = buildFormObject( $(this) );
				$.extend(val,  rets); 
			});

			if(name)
			{
				var toRet = {};
				toRet[ name ] = val;
				return toRet;
			}
			else
			{
				return val;
			}
		}						
	}
	
	var intersectingArrays = function(ar){
	    if (ar == null) return false;
	
	    var a = new Array();
	
	    if (ar.length == undefined) // Associative Array
	    {
	        for (var i in ar)
	         a.push(ar[i]);
	    }
	    else
	     a = ar;
	
	    if (a.length == 1) return false; // Single array ? Nothing to intersect with
	
	    var common = new Array();
	    function loop(a, index, s_index, e_index)
	    {
	        if (index == null) index = 0;
	        if (s_index == null) s_index = 0;
	        if (e_index == null) e_index = a[index].length;
	        if (index == a.length - 1) return;
	
	        for (var i = s_index; i < e_index; i++)
	        {
	            if (common.indexOf(a[index][i]) != -1) continue;
	            for (var j = 0; j < a[index + 1].length; j++)
	            {
	                if (a[index][i] != a[index+1][j]) continue;
	                loop(a, index + 1, j, j + 1);
	                if (index + 1 == a.length - 1) { common.push(a[index][i]); break; }
	            }
	        }
	    }
	
	    loop(a);
	    return common;
	}
	
	var intersectingObjects = function(obj1, obj2, uniqueProp) { 
		var intersect;
		
		if(!obj1 && !obj2) //results from niether one
		{
			intersect = undefined;
		}
		else if(!obj1 && obj2) //results from only one
		{
			intersect = obj2;
		}
		else if(!obj2 && obj1) //results from only one
		{
			intersect = obj1;
		}
		else if(obj1.length == 0 && obj2.length == 0) //results from both but both are empty
		{
			intersect = [];
		}
		else
		{
			intersect = [];
			
			var uniques1 = CE.util.getPropertyArray(obj1, uniqueProp);
			var uniques2 = CE.util.getPropertyArray(obj2, uniqueProp);
			var uniques = CE.util.intersect.arrays( [uniques1, uniques2] );

			var all = obj1.concat(obj2);
			
			for(var i in all)
			{
				var index = uniques.indexOf( all[i][uniqueProp] );
				if( index != -1 )
				{
					intersect.push( all[i] );
					delete uniques[index];
				}
			}
		}
		return intersect;
	} 
	
	var getPropertyArray = function(input, field) { 
		var output = [];
		for(var i in input)
			output.push(input[i][field]);
		return output;
	}
	
	var disable = function(e) { $(e).each(function() { $(this).attr({disabled:'disabled', tabindex:"-1"}).addClass('disabled'); }) };
	var enable =  function(e) { $(e).each(function() { $(this).removeAttr('disabled tabindex').removeClass('disabled'); }) };
	
	var disbaleRightClick = function(enable) { 
		if(!enable)
			CE.log.warn('This page does not accept right clicks.');
		
		document.getElementsByTagName('body')[0].oncontextmenu = enable ? function(e) { return true; } : function(e) { return false; };
	}
	
	$(document).ready(function() {
		if( RIGHT_CLICK_DISABLED )
			disbaleRightClick( );
	});

	
	ce_.util = {
		"hotkeys" : hotkeys.setupHotkeys,
		"buildForm": buildFormObject,
		"alert" : alert,
		"confirm" : confirm,
		"intersect" :{
			"arrays" : intersectingArrays,
			"objects" : intersectingObjects
		},
		"disableRightClick" : disbaleRightClick,
		"getPropertyArray" : getPropertyArray,
		"isNumberCode" : function(code) {return numberKeyCodes.indexOf( code ) != -1; },
		"disable" : disable,
		"enable" : enable,
		"loader" : {
			"start": function(){ if($('body').children('#loader').length == 0) $('body').append('<div id="blocker"><img src="images/spinner_med.gif" id="loader" /></div>'); $('#blocker').fadeIn('fast');},
			"stop" : function() { $('#blocker').fadeOut('fast');  }
		}
		
	}
	
	return ce_;
	
})(CE || {});