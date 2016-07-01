function AdminCtrl($scope) { 
	"use strict";

	//Build a list of settings key to get from the DB		
	var rows = ['machine_id', 'location', 'campus', 'invoice_prefix', 'last_sync', 'created', "drawer_code", "cut_code", "live_mode", "printer"];
	
	//Get them and apply the return object to the $scope for angular access
	CE.DB.settings.get( rows ).done(function(vals){ 
		//We need to do a reset of last sync if the machine id changes
		vals.machine_id_old = vals.machine_id;
		
		$scope.model = vals; 
		$scope.$apply();
	});
	
	// TIM : don't try to get printers
	//CE.print.getAll().done(function(printers){ $scope.printers = printers.split(','); $scope.$apply(); });
	
	$scope.close = function(){
		chrome.app.window.current().close();
	}
	
	$scope.sync =  function sync(isAll) {
		CE.util.loader.start(); 
		CE.POS.sync(isAll).always(CE.util.loader.stop).done($scope.$apply);
	}
	
	//$scope.openDrawer = CE.print.openDrawer;
	
	$scope.deleteDB = function(){
		CE.util.confirm('Confirm', 'Are you sure you want to delete the entire local database?')
		.done( function(){
			//Start the loader
			CE.util.loader.start();
		
			//Reset the database
			var promise = CE.DB.reset();
			
			//On error, log it
			promise.fail(function() { 
				CE.log.error('Failed trying to delete the local database.'); 
			});
			
			//Always stop the loader and logout
			promise.always(CE.util.loader.stop, logout);
				
		});		
	}
	
	$scope.setPrinter = function(){
		CE.print.find($scope.model.printer);
	}
	
	$scope.prettyDate = function(unix_time){
		return new Date(unix_time).toLocaleString();
	}
	
	$scope.changeMode = function(){
		CE.util.confirm("Please Confirm", "Are you sure you want to change modes? All local data will be cleared.")
		.done(changeSandboxLiveMode);
	}
	
	function changeSandboxLiveMode(){
		CE.util.loader.start();
		
		//Changing either from -1 to 1 or from 1 to -1
		var newMode = $scope.model.live_mode * -1; 
		
		//Save the new mode
		var modePromise = CE.DB.settings.put({
			"live_mode": newMode,	//Save the new mode
			"machine_id": ""		//Clear the machine ID becuase it will be wrong after changings ORGs
		});
		
		//Clear the database of most of the stores
		var clearPromise = CE.DB.clear();
		
		//When they are done, stop the loader and logout
		$.when(modePromise, clearPromise).always(CE.util.loader.stop, logout);
	}
	
	$scope.save = function() { 
		//Start the loader
		CE.util.loader.start();
		
		//If the machine changed, 
		var machineChange = $scope.model.machine_id != $scope.model.machine_id_old;
		
		if(machineChange)	
			CE.log.debug("Resetting last sync date for a full sync");


		//Delete the old properties so we dont save it in the settings
		delete $scope.model.machine_id_old;
		
		//Do a new configure with our new machine id
		//NOTE: configure resolves immediately with a {} if no string is passed in 
		CE.POS.configure($scope.model.machine_id)
		//Save the results from the configure/
		//The finish of this promise will be our promise. 
		//We have to have updated the $scope.model so when we save it in the settings it will be the latest			
		.then(
			function(result) {
				
				//If we have a response, put all the response objects into the model
				if(result && result.response)
					$.extend($scope.model, result.response);

			},
			function() { 
				//If the configure fails, log the error
				CE.log.error('There was a save error when saving configuration settings');
			}
		)
		//Save the new settings
		.then(function(){
			return CE.DB.settings.put($scope.model);
		})
		//Then synchronize and force sync all if the machine has changed
		.then(function(){
			return CE.POS.sync(machineChange);
		})
		//And then always stop the loader and apply the view to the user
		.always(CE.util.loader.stop, function(){ $scope.$apply() });
	}	
	
	function logout(){
		CE.util.alert('Logout Needed', 'You will be logged out now.')
		.always(function(){ 
			//Cannot syncronize here due to invalid (lackof) session token
			//When user logs in- he will be loaded with most basic permissions until a second logout
			window.chrome.app.window.current().close();
			CE.main.logout(); 
		});
	}
}