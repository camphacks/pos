function LookupController($scope) { 
	"use strict";
	
	/*
	 * Method to select an item when it is clicked on in the results view
	 */	
	$scope.select = function(merch) { 
		if(merch)
		{
			if( typeof apply == "function")
			{
				apply( merch.sku );
				chrome.app.window.current().close();
			}
			else
			{
				throw "Could not locate call back function";
			}
			
		}
	}
	
	/*
	 * Run on button press or on 'Enter' press
	 */
	$scope.query = function() { 
		var sku = $scope.model.sku || "";
		var name = $scope.model.name || "";
		
		if(sku.trim().length == 0 && name.trim().length == 0)
		{
			$scope.model.results = undefined;
			$scope.$apply();
		}
		else
		{
			var promise = $.when(searchForIn(sku, 'sku'), searchForIn(name, 'name'));
	
			promise.done(function(m1, m2) { 
				//Apply the data to the model
				$scope.model.results = CE.util.intersect.objects(m1, m2, 'id');
				
				//Update the view
				$scope.$apply();
			});
			
			promise.fail(function(e) { console.log(e); });			
		}
	}
	
	/* START INITIALIZATION CODE */
	//The model for the page
	$scope.model = {};
	
	//Initialized with search name
	if(typeof loaded_name == "string") 
		$scope.model.name = loaded_name;
		
	//Initialized with search sku	
	if(typeof loaded_sku == "string") 
		$scope.model.sku = loaded_sku;
		
	//Run an initial query if we have any data
	if(!$.isEmptyObject($scope.model))
		$scope.query();
	/* END INITIALIZATION CODE */


	
	function searchForIn(q,i) {
		if(q && q.length > 0)
			return CE.DB.merch.find[i](q);
		return $.Deferred().resolve();
	}	
}

// This directive should be moved
//Directive to run on an enter press on an element
angular.module("Lookup",[]).directive('ceEnter', function () {
    return function (scope, element, attrs) {
        element.bind("keydown keypress", function (event) {
            if(event.which === 13) {
                scope.$apply(function (){
                    scope.$eval(attrs.ceEnter);
                });

                event.preventDefault();
            }
        });
    };
});

