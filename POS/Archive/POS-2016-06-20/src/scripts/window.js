/* Should only be included on the background page 

This module provides a wrapper around the 

	window.chrome.app.window.create() 

method.

The wrapper ensures that the most recently created 
window stays on top for the duration of the apps runtime.

The wrapper also overrides the 
	
	window.chrome.app.window.create()

method for all its children and therefore all its children's 
children and so on.
	
*/

(function(chrome) {
	"use strict";

	var _create = chrome.app.window.create,
	    _stack = []; 
		
	/************ START FOCUS MANAGER ************/
	var open = function(name, opts, cb){
		var callBack = modifyCallBack(cb, name);
		_create(name, opts, callBack);
	}

	/* OVERRIDE CHROME'S WINDOW CREATER */
	chrome.app.window.create = open;

	
	/* This creates a new function that includes the original request callback.
	 * it also prefaces the original call back and adds a listener for a blur 
	 * and close of the window
	 */
	function modifyCallBack(cb, pageName) { 
		return function(c_win) { 
			var win = c_win.contentWindow;
			win.name_id = rand();

			var topWin = top();
			if( topWin )
			{
				disable( topWin ); //disable the one that is losing focus
				c_win.onClosed.addListener(function(){ 
					enable(topWin); 
				}); //Mark the next window for enable when top closes
			}
			
			_stack.push(win); //add the new window to the focus stack
			
			win.chrome.app.window.create = open; //override child's window creator
			
			win.addEventListener('focus', function(){ onfocused(this); }); //when ever this window is focused
			
			if( typeof cb == "function" )
				win.setTimeout(function(){ cb( c_win ); }, 0);
		}
	}
	/************ END FOCUS MANAGER ************/	
	
		
	/************ START EVENT LISTENERS ************/	
	/* if the blurred window was on top, focus it again */
	function onfocused(win) {
		var topWin = top();
		
		if(topWin && win && topWin.name_id != win.name_id) //if the top window is NOT the one that gained focus
			topWin.chrome.app.window.current().focus(); //focus what should be the top window
	}
	/************ END EVENT LISTENERS ************/	
	
	
	/******* START HELPER FUNCTIONS *********/
	function top() { 
		for(var i = _stack.length-1; i >= 0; i--)
			if( _stack[i].closed  )
			{
				_stack.splice(i, 1); //remove the closed window
				return top(); //call again to look through list correctly
			}
			else
			{
				return _stack[i];
			}
		return undefined;
	}

	function rand() { 
		return Math.floor(Math.random() * Number.MAX_VALUE); 
	}	
	
	function disable(win) {
		if(win)
		{
			var body = win.document.getElementsByTagName('body')[0];
			var e = win.document.createElement('blocker');
			e.setAttribute("id", "window-blocker");
			e.setAttribute('style', 'display:block; width:100%; height:100%; position:absolute; left:0px; top:0px;');
			body.appendChild(e);
		}
	}
	
	function enable(win) { 
		if(win)
		{
			var blocker = win.document.getElementById('window-blocker');
						
			if(blocker)
			{
				blocker.parentNode.removeChild(blocker);
			}
		}
	}
	/******* END HELPER FUNCTIONS *********/
	
})(chrome);