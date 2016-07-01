function HistoryController($scope) { 
	"use strict";
	
	$scope.search = function(){
		var y = $scope.model.year;
		var m = $scope.model.month;

		CE.util.loader.start();

		CE.POS.getMonth(m,y)
		.done(function(response){
			console.log(response);
			$scope.model.results = response.response.reports;
			
			for(var i in $scope.model.results)
			{	
				var r = $scope.model.results[i];
				r.day_start = new Date(r.day_start).toLocaleString();
			}
			$scope.$apply();
			CE.util.loader.stop();
		})
		.fail(function(){
			CE.log.error("Error looking up the end of day reports");
			CE.util.alert("Report", "Error looking up the end of day reports");
		});
	}
	
	/* START INITIALIZATION CODE */
	//The model for the page
	$scope.model = {};
	$scope.model.months = [1,2,3,4,5,6,7,8,9,10,11,12];
	$scope.model.years = [];
	var today = new Date();
	for(var i = today.getFullYear(); i > today.getFullYear() - 5; i--)
		$scope.model.years.push(i);

	$scope.model.month = today.getMonth() + 1;		
	$scope.model.year = today.getFullYear();
	$scope.search();
	/* END INITIALIZATION CODE */
}