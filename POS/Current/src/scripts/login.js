function LoginController($scope) { 
	"use strict"
	
	//Run the loader until the database is ready
	CE.util.loader.start();	
	//CE.DB.promise.done(CE.util.loader.stop);
	
	navigatorOnLine = false;
	// Assign handlers immediately after making the request,
	// and remember the jqXHR object for this request
	var jqxhr = $.ajax("https://campeagle.org/index.php")
	.done(function()
	{
		navigatorOnLine = true;
	})
	.fail(function()
	{
		navigatorOnLine = false;
	})
	.always(function()
	{
		CE.DB.promise.done(CE.util.loader.stop);
		console.log('navigator:' + navigatorOnLine);
	});	

	//Holds login data: user, password
	$scope.data = {};
	
	$(document).keypress(function(e) { if(e.keyCode == 13) $scope.login(); })		
	
	//Wait 5 seconds and then try to register the printer.
	//window.setTimeout(CE.print.find, 5000); TIM
	
	/* function called internally on login click */
	$scope.login = function() { 
		//Start the loader to prevent multiple clicks
		CE.util.loader.start();
		var loginPromise;
		
		//Get the username and password or revert to default for debugging
		var un = $scope.data.user;
		var pw = $scope.data.password;
		
		
		if(!un || !pw)
		{
			//If the username or password is blank
			loginPromise = $.Deferred().reject();	
		}
		else
		{				
			//Clear the password 
			$scope.data.password = "";
			
			loginPromise = CE.POS.login(un, pw);		
		
			loginPromise.done(function(result) { 
				//If login is correct, clear the input for when the user logs out of the system.
				$scope.data.user = "";
	
				var options = {
					"minHeight" : 700,
					"minWidth": 1100,
					"bounds" : {
						"width": 1200,
						"height": 900
					},
					"state" : "normal" /* "fullscreen" */
				};
				
				/* 
				 * Function to handle the creation of the new main window
				 */
				function copyCE(win) {
					//Copy the CE object or use a new object
					win.contentWindow.CE = $.extend({}, {util: {}}, CE);
					
					//Hide !NOT CLOSE! the current window
					chrome.app.window.current().hide();
					
					//When the new main window is closed, show this window again
					win.onClosed.addListener( function() { chrome.app.window.current().show(); });
				}
				
				//Create the window 
				chrome.app.window.create('index.html', options, copyCE);
				
				// force a full sync?
				CE.POS.sync(true);
			});
		}
		
		loginPromise.fail(function(jqXHR)
		{
			console.log('jqXHR: ' + jqXHR);
			/*var str = e.replace(/\n/g,'\\n').replace(/\\n/g, ' ');
			str = str.replace('"[', '[').replace(']"',']');
			var obj = JSON.parse(str);
			CE.util.alert('Login Failed', obj.responseJSON[0].message); 
			*/
			//for(var a in arguments)
			//	console.log('arguments['+a+']: ' + arguments[a]);
			
			CE.util.alert('Login Failed', 'Invalid username or password'); 
		});
		
		loginPromise.always(function(){
			$scope.$apply();	
			CE.util.loader.stop();
		});
	}
	
	
}