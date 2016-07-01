(function() { 
	"use strict";
	
	$(document).ready(function() {
		/* Listeners */
		$('button#agree').click(setEmail);
		$('button#cancel').click(cancelCheckout);
		
		$('input').keydown(function(e) { if(e.keyCode == 13) setEmail(); });
		
		console.log(values.tier);
		console.log(values.items);
		var tier = values.tier;
		var items = [];
		for(var i in values.items)
		{
			var item = {};
			item.name = values.items[i].name;
			item.quantity = values.items[i].number;
			item.price = 0;
			for(var j = 0; j < values.items[i].prices.length; j++)
			{
				if(values.items[i].prices[j].price_book_id == tier)
				{
					item.price = values.items[i].prices[j].amount;
					break;
				}
			}
			console.log(item);
			items.push(item);
		}
		console.log(items);
		for(var i = 0; i < items.length; i++)
			$('#items').append("<tr><td style='width: 150px;'>" + items[i].name + "</td><td style='width: 50px;'>$" + parseFloat(items[i].price).toFixed(2) + "</td><td>" + items[i].quantity + "</td><td>$" + ((parseFloat(items[i].price) * parseInt(items[i].quantity))).toFixed(2) + "</td></tr>");
		$('#items').append("<tr style='font-weight: bold;'><td></td><td></td><td>Total:</td><td>$" + parseFloat(values.subtotal).toFixed(2) + "</td></tr>");

		$('#emptyMessage').hide();
		$('#email').focus();
		$('#amt').text(parseFloat(values.subtotal).toFixed(2));
	});
	
	function cancelCheckout()
	{ 
		chrome.app.window.current().close();
	}
	
	function setEmail()
	{ 
		var em = $('#email').val();
		if( typeof apply == 'function')
		{
			apply( em );
			proceedWithCheckout();
			chrome.app.window.current().close();
		}
		else
		{
			throw "Could not locate call back function";
		}
		return;
	}
	
})();