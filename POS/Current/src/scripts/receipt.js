
function ReceiptCtrl($scope) {
	
	//Create function to return css to hide the element if it should not be displayed
	$scope.hide = function(shouldShow){
		if(!shouldShow){
			return ' display:none; ';
		}
	}
	
	//Was a transaction number correctly passed in	
	if(typeof window.loaded_sale_id != "number")
		throw 'Cannot locate sale id';
		
	//Load the receipt, then print, then close on completetion
	CE.DB.settings.get("printer")
	.then(function(vals){ return CE.print.find(vals.printer) })
	.then(function(){ return loadReceipt( window.loaded_sale_id )})
	.then(printReceipt, function(){ return CE.log.error("Tried to print a receipt with an invalid transaction number."); })
	.always(function(){ chrome.app.window.current().close(); });	

	
	function loadReceipt(id) {
		var data = ["city", "street", "state", "postal", "campus", "location", "phone"];
		var promise = $.when(CE.DB.settings.get(data), CE.DB.trans.get(id));
		
		return promise.then(function(location, transaction){
				
				//Set the view model in the scope		
				$scope.location = location;
				$scope.transaction = transaction;	
				
				//Show the correct date format
				$scope.transaction.transaction_date = new Date(transaction.transaction_date).toLocaleString();
				
				//Tell Angular JS that we have updated the model
				$scope.$apply();			
				
				var copiesToPrint = 1;
				if(transaction.payment.credit_card)
				{
					copiesToPrint++;
				}
				
				
				var shouldOpenDrawer = (transaction.payment.credit_card != undefined) || 
											(transaction.payment.cash != undefined) ||
											(transaction.payment.check != undefined);
				
				//Return information about what should be printed or cash drawer opened
				return {
					copies: copiesToPrint,
					drawer:	shouldOpenDrawer
				};
		});
	}
	
	
	function printReceipt(data){
		//If drawer should be opened. Only if true, not just truthy
		var promise;
		
		if(data.drawer === true)
			promise = CE.print.openDrawer(true);
		else
			promise = $.Deferred().resolve();
	
		//Initialize copies to 1 if parameter comes in incorrectly 
		if(typeof data.copies !== "number")
			data.copies = 1;
	
		//Delete any elements that are hidden
		//QZ-Print does not correctly hide hidden elements
		$(':hidden').remove();
		
		//Wrap the html correctly
		var toPrint = "<html>";
		toPrint += $('body').html();
		toPrint += "</html>";
		
		for(var i = 0; i < data.copies; i++)
		{
			promise = promise
			.then(function(){ return CE.print.appendHTML(toPrint);	})
			.then(function(){ return CE.print.printHTML();			})
			.then(function(){ return CE.print.cutPaper(true);		});
		}
		
		return promise;
		
	}
	
		
}
