(function(){
	"use strict"
	
	var app_;

	function launch(){ 	
		console.log("Launching new instance...");
		
		var options = {
		    bounds: {
			    height: 225,
			    width: 400,
		    },
		    resizable: false
		};
		
		chrome.app.window.create("login.html", options, function(win){
			app_ = win;
			win.onClosed.addListener(function(){ app_ = undefined; });
		});
	}
	
	function singleton(){
		console.log("Launching app...");
		
		if(app_ && app_.focus)
			app_.focus();
		else
		{		
			launch();
		}
	}

	chrome.app.runtime.onLaunched.addListener(singleton);
})();