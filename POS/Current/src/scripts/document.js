var CE = (function(ce_){
	"use strict";
	/*
	 * Called once on page load
	 */
	
	function documentInit()
	{			
		console.log(Date.now() + ' loading document.js...');
		console.log(ce_);
		console.log('POS..');
		if(CE == null)
			CE = ce_;
		console.log(CE.POS);
		if(typeof CE.POS != 'undefined')
			initializeDocument();
		else
			setTimeout(documentInit, 100);
	}
	
	$(document).ready(function() {
		documentInit();
	});
	
	function initializeDocument()
	{
		CE.util.loader.start();
		
		//If the window closes, make sure we logout
		chrome.app.window.current().onClosed.addListener(CE.POS.logout);
				
		CE.POS.sync().then( //When sync has completed 
			function() {  
				resetHeaderBar();
				setHeaderName();
				addMerchRow();
				applyPermissions();
				
				return $.when(
					setupPriceTiers(),
					addListeners(),
					CE.util.hotkeys()
				);
			}, 
			function(e) { 
				CE.log.error("Error trying to sync.", e);
				CE.util.alert("Error","Error trying to sync. Contact support immediately.");
			}).always(CE.util.loader.stop);
	}

	/*
	 * Used to store values for the current invoice
	 */	
	var values = {
		subtotal: 0,	//Entire subtotal
		tax: 0,			//Entire tax
		tier: '',		//Pricebook being used (i.e. guest, fulltime, summer staff)
		items : {},		//Map holds the merchandise added as indexed by its sku
		isReturn: false,//Boolean determines if it is a return session
		invoice : "ERROR",
		
		// Reset all the values in this object
		reset: function(){ 
			this.subtotal = 0; 
			this.tax = 0; 
			this.tier = ''; 
			this.items = {}; 
			this.isReturn = false; 
			this.invoice = "ERROR";
		},
		
		//TIM: add email for email receipt
		email : ''
	};	
	
	/*********** START HEADER BAR MANAGER ***********/
	function resetHeaderBar() { 
		setupPriceTiers();
		$('#transaction-type').val('sale').trigger('change');;
		CE.DB.settings.get(['campus', 'location', 'invoice_prefix']).done(function(vals) { 
			
			var loc;

			if(vals.location && vals.campus)
				loc = vals.location + ' (' + vals.campus + ')';
			else
				loc = "Machine ID Needed";
			
			$('#location').text(loc);
	
			//Get the current unix time (in seconds)
			var time = new Date().getTime().toString().slice(1,10);	
			
			//Make the invoice number the prefix + the current unix time 
			values.invoice = (vals.invoice_prefix || "INV-") + time;
			$("#invoice-number").text(values.invoice);
	
		});	
	}
	
	function setHeaderName() { 
		CE.DB.session.getCurrent().then(function(session) { 
			return CE.DB.users.get(session.user);
		}).done(function(user) { 
			if(user && user.name)
				$('span[data-name=user-name]').text( user.name );
		});
	}
	
	function setupPriceTiers() { 
		var promise = CE.DB.prices.all();
		
		promise.done( function(pricesObject) {
			$('select#price_tiers').html("");
			
			var prices = []; //Will hold an array of the prices objects instead of ID key'd map
			for(var i in pricesObject)
				prices.push(pricesObject[i]);
				
			prices.sort(function(a,b){ return a.level - b.level; });
			
			for(var i in prices)
				$('select#price_tiers').append('<option value="' + prices[i].id + '">' + prices[i].name + '</option>');
			
			$('select#price_tiers').trigger('change');	
		});
		
		
		$('select#price_tiers').change(function() { 
			calculateTotals();
			var name = $(this).find('option:selected').text().substringBefore(' ');
			$('#price-tier-section').attr('data-tier',  name);

		});
	}
	/*********** END HEADER BAR MANAGER ***********/	
	
	/********* START BARCODE INPUT LISTENERS **********/
	/* object manages barcode input event and determining if a sequence of entered numbers is a barcode or not */
	var barcode = {timeout: 0, value: "", listen: function() { document.body.addEventListener('keypress', barcode.listener, true); }, listener: function(e){
		if($('input.sku:last').is(':focus'))
			return;
			
		if(e.keyCode == 13) //Enter at end of barcode input
		{	
			var result = barcode.value;
			barcode.value = "";
			
			if(result.length == 13 || result.length == 8 || true)
			{
				var interval = new Date().getTime() - barcode.timeout;
				barcode.timeout = 0;
				
				if(interval <= 100)
				{
					setSku(result);
				}
			}
		}
		
		else if(e.keyCode >= 48 && e.keyCode <= 57)
		{
			if(barcode.timeout == 0)
			{
				barcode.timeout = new Date().getTime();
			}
			
			barcode.value += String.fromCharCode(e.which);
		}
	}};
	/********* END BARCODE INPUT LISTENERS **********/
	
	
	/************ START CLICK AND KEYBOARD LISTENERS ***********/
	function addListeners(){
		/* START Launch windows */
		$('#admin').click(launchAdmin); 
		$('#endday').click(endDay);
		$('#history').click(launchHistory);
		$('#new').click(newOrder);
		$('#checkout').click(launchCheckout);
		$('#find-item').click(launchItemLookup);
		$('#find-guest').click(launchGuestLookup);
		/* END Launch windows */
		
		$('#transaction-type').change(function() { $('body').attr('data-mode', $(this).val() ); values.isReturn = $(this).val() == 'return'; });
		
		//logout click simulates window close. 
		//A listener on the window closing takes care of the logout
		$('#logout').click(function(){ chrome.app.window.current().close() }); 

		$("#account-lookup").click(function() { if( $(this).hasClass('lookup') ) quickFindAccount(true); else  loadAccount(); }); //click icon by account name
		$("#account-input").keypress(function(e) { if(e.keyCode == 13) quickFindAccount() }) //enter press for account anme

/* OPENS DUPLICATE WINDOW ON ENTER PRESS */
//		$("#account-input").change(function() { if( $(this).val() ) quickFindAccount(); else loadAccount(); });  

				
		barcode.listen();
	}	
	
	
	function endDay(){
		
		CE.log.debug("About to end day");
		CE.util.confirm("End of Day", "Are you sure you want to end the current 'day'? You will be shown the end of day report and then logged out.")
		.then(function(){ CE.util.loader.start(); return CE.POS.endDay(); } , function(){})		
		.done(function(resp){
			var report = resp.response;
			console.log(report);
			if(report)
			{
				var info = [];
				info.push("<div style='height: 70%; overflow-y: scroll;'>");
				info.push("Day Number: " + report.day_number );
				info.push("Start Day: " + new Date(report.day_start).toLocaleString());
				var totalConsumable = 0;
				var totalMerchandise = 0;
				var totalCash = 0;
				var totalCheck = 0;
				for(var c in report.cashiers)
				{	

					if(report.cashiers[c].cashPerFamily !== undefined){
						var cPF = report.cashiers[c].cashPerFamily;
						var keys = Object.keys(cPF);
						if(keys !== undefined){
							for(var i = 0; i < keys.length; i++){
								if(cPF[keys[i]] !== undefined && keys[i] == 'Consumable'){
									totalConsumable += cPF[keys[i]];
								} else if(cPF[keys[i]] !== undefined && keys[i] == 'Merchandise'){
									totalMerchandise += cPF[keys[i]];
								}
							}
						}
					}
					totalCash += report.cashiers[c].cash_gain;
					totalCheck += report.cashiers[c].check_gain;
				}
				info.push("<br/> Total Consumable Gain: $" + totalConsumable.toFixed(2));
				info.push("<br/> Total Merchandise Gain: $" + totalMerchandise.toFixed(2));
				info.push("<br/> Total Cash: $" + totalCash.toFixed(2));
				info.push("<br/> Total Check: $" + totalCheck.toFixed(2));
				for(var c in report.cashiers)
				{
					info.push("<br/><i>Cashier: " + c + "</i>");
					info.push("Cash Gain: $" + report.cashiers[c].cash_gain);
					info.push("Check Gain: $" + report.cashiers[c].check_gain);
					//totalCash += report.cashiers[c].cash_gain;
					//totalCheck += report.cashiers[c].check_gain;
				}
				info.push("<br/> Total Consumable Gain: $" + totalConsumable.toFixed(2));
				info.push("<br/> Total Merchandise Gain: $" + totalMerchandise.toFixed(2));
				info.push("<br/> Total Cash: $" + totalCash.toFixed(2));
				info.push("<br/> Total Check: $" + totalCheck.toFixed(2));
	
				info.push("<br /><strong>You will be logged out when you click 'OK'.</strong");
				info.push("</div>");
				
				CE.util.alert("End of Day Report", info.join("<br />"))
				.always(CE.main.logout);
			}
			else
			{
				CE.log.error("End of day report came back empty.", resp);
				CE.util.alert("End of Day", "End of day report from SalesForce was empty. <br/><strong>Please contact your administrator.</strong><br /><br />Logging out...")
				.always(CE.main.logout);
			}
		});

	}
	
	function applyPermissions(){
		CE.DB.session.permissions.admin().done(function(hasPermission) { 
			if(!hasPermission) 
				$('#admin').parent().remove(); 
		});	
		
		CE.DB.session.permissions.discount().done(function(hasPermission) { 
			if(hasPermission) 
				$('body').addClass('discount');
		});	
	}

	
	/************ START SECONDARY PAGE LAUNCHERS ***********/
	//This boolean value denotes if a window is open yet already.
	var windowOpen = false;
	
	function launch(url, options, callback){
		//If there is no other windows open
		if(!windowOpen)
		{	
			//Mark that we are opening a window
			windowOpen = true;
			
			//Open the window and modify the callback
			chrome.app.window.create(url, options, function(win){
				
				//When it does close, mark that we dont have any windows open
				win.onClosed.addListener(function(){
					windowOpen = false;
				});
				
				//Call the original callback if it exists.
				if(typeof callback === "function")
					callback(win);
			});
		}
		
	}
	
	function launchAdmin(name) { 
		launch('admin.html', {
				id: "admin",
				minWidth: 700,
				minHeight: 400,										
			}, function(win) {
				win.contentWindow.CE = $.extend({}, {util: {}}, CE);
				win.onClosed.addListener( function() { 
					resetHeaderBar();
				});
		});		
	}	
	
	function launchCheckout() { 
		launch('checkout.html#default', {
				id: "checkout",
				minWidth: 1000,
				minHeight: 580,		
				resizable: false,								
			}, function(win) { 
				win.contentWindow.values = values;
				win.contentWindow.CE = $.extend({}, {util: {}}, CE);				
				win.contentWindow.successful = function() { newOrder(); };
		});
	}
	
	function launchItemLookup(name, sku) { 
		launch('item_lookup.html', {
				minWidth: 700,
				minHeight: 400,										
			}, function(win) {
				win.contentWindow.apply = setSku; 
				win.contentWindow.values = values;

				if(name) win.contentWindow.loaded_name = name;
				if(sku) win.contentWindow.loaded_sku = sku;

				win.contentWindow.CE = $.extend({}, {util: {}}, CE);
		});
	}
	
		
	function launchHistory() { 
		launch('history.html', {
				minWidth: 700,
				minHeight: 400,										
			}, function(win) {				
				win.contentWindow.CE = $.extend({}, {util: {}}, CE);
		});
	}
	
	function launchGuestLookup(name) { 
		CE.log.info('Opening guest lookup window');
		launch('guest_lookup.html', {
				minWidth: 700,
				minHeight: 400,										
			}, function(win) {
				win.contentWindow.apply = applyAccount; 
				win.contentWindow.values = values;

				if(name) win.contentWindow.loaded_name = name;
				win.contentWindow.CE = $.extend({}, {util: {}}, CE);
		});		
	}
	/************ END SECONDARY PAGE LAUNCHERS ***********/


	/********** START NEW ORDER FUNCTIONS ***********/
	function newOrder() { 
		$('table.items>tbody>tr').remove();
		values.reset();
		resetHeaderBar();
		loadAccount();
		calculateTotals();
		addMerchRow();
		focusSku();
	}
	/********** END NEW ORDER FUNCTIONS ***********/
	
		
	/*********** START CAMP ACCOUNT METHODS *************/
	function quickFindAccount(forceLaunch) { 
		var name = $('#account-input').val();
		loadAccount();
		launchGuestLookup(name);
		/*if(name.length == 0 )
		{
			loadAccount();
			if(forceLaunch)
				launchGuestLookup();
		}
		else
		{
			CE.DB.accounts.find.name(name)			
				.done( function(accounts) { 
					if(accounts.length == 1  && accountIsOpen(accounts[0]) )
						loadAccount(accounts[0]);
					else
					{
						loadAccount();
						launchGuestLookup(name);
					}
				});	
		}*/
	}
	
	function accountIsOpen(account) {
			return true;/*
		var now = new Date().getTime();
		return now > account.event_start_date && now < account.event_end_date;*/
	}
	
	function applyAccount(act_id) { 
		var promise = CE.DB.accounts.get( act_id );
		
		promise.done( function(act) {  if(act) loadAccount(act); });
		promise.fail( function(e) {  CE.util.alert('Account Lookup', 'Could not locate account in the database.'); });
	}
	
	function loadAccount(account) { 
		var $a = $('table#camp_account');

		if(typeof account == "undefined")
		{
			$a.find('img.hoverIcon').removeClass('clear').addClass('lookup');
			$a.find('tbody').removeAttr('data-id');
			$a.find('[data-name=name]').val('');
			values.account = undefined;
		}
		else
		{
			values.account = account;
			$a.find('[data-name=name]').val((account.first_name || '') + ' ' + (account.last_name || ''));
			$a.find('tbody').attr('data-id', account.id );
			$a.find('img.hoverIcon').removeClass('lookup').addClass('clear');
			$a.find('[data-name=birth_date]').text( (new Date(account.birth_date).pretty() || '') );
			$a.find('[data-name=amount]').text( account.amount.toFixed(2) );
		}
	}
	/*********** END CAMP ACCOUNT METHODS *************/	
	
	
	/*********** START MERCHANDISE METHODS *************/
	/*
	 * Called when the barcode reader finds a new sku number.
	 * Called as the result of the item lookup window closing.  
	 */
	function setSku(sku) { 
		// Find the sku input box on the bottom (empty) row in the merch table
		var $input = $('table.items tbody tr:not([data-sku])').find('input.sku');
		$input.val(sku); // Set it to the value of the sku
		applySku( $input[0] ); //Send off the input element as the row identifier to apply the sku to the rest of the row
	}
	

	/*
	 * This row takes any item within the merch row or the merch row itself and 
	 * applies the sku in the input item sku number box to the rest of the merch row.
	 * If the sku is not all numbers, it launches the item lookup window. 
	 * 
	 */	
	function applySku(e){
		var $row = $(e).is('tr') ? $(e) : $(e).parents('tr').first();
		var sku = $row.find('input.sku').val();
		
		// Get the number from the sku
		if( sku.isNumeric() )
			sku = sku.match(/^\d+$/);	
		else
		{
			launchItemLookup(sku); //Try to lookup the sku in the lookup window if contains non-numeric
			return;
		}
		

		if(sku && sku.length ) // If there is a sku
		{
			sku = sku[0]; // Get the sku from the array
			$row.find('input.sku').val( sku ); //
		}	
		else
		{
			$row.find('input.sku').val(''); // Reset this row and finish
			return;
		}
			
		//Lets try to find an exsiting row with the same sku
		var $existing = $('table.items tbody tr[data-sku='+sku+']'); 
		if($existing.length) //There is an existing row with the sku
		{
			values.items[sku].number++; //Increment the quantity in our hidden values object
			$existing.find('input.qty').val( $existing.find('input.qty').val().increment(true) ) ; //increment the quantityon the form
			$row.find('input.sku').val(''); //Remove the sku from the second row with the same sku
			calculateTotals(); //Recalculate the form
		}
		else //It is the first row with this sku
		{			
			var promise = CE.DB.merch.bySku(sku); //Lookup the merch by the sku
			
			promise.done(function(merch) {  //When we have the merch
				if(merch) 
				{
					merch.number = 1; //always start with buying 1
					values.items[merch.sku] = merch; //Save merch for later in values object
					
					$row.attr('data-sku', merch.sku || sku); //Set the attribute to the sku for later incrementing if same sku is applied twice
					$row.find('input.sku').attr('disabled', 'disabled'); //Remove editability to the sku input box
					$row.find('span.color').text(merch.color || 'N/A'); //Set size or defualt to N/A
					$row.find('span.size').text(merch.size || 'N/A'); //Set size or defualt to N/A
					$row.find('span.desc').text(merch.name); //Set name
					$row.find('input.qty').val('1'); //Default to qty of one


					if(!merch.prices.length){ //There are no viable prices in our object to use
						CE.util.alert('No Prices Found', 'Error: There are no prices available for this item.');
						$row.remove(); //remove item
					}
						
					calculateTotals(); //Recalculate form
					addMerchRow(); //Add a new merch row
				}
				else //If could not find merch in db
				{ 
					$row.remove(); //Remove the row
					addMerchRow(); //Add a new blank row
					launchItemLookup(undefined, sku); //Launch item lookup with the given sku
				}
			});
		}		
	}	
	
	/*
	 * Called when the qty of a mech row changes. 
	 * e: input box element for the quantity on the merch form
	 */
	function applyQty(e) { 
		var $row = $(e).parents('tr').first(); //Get the row of this qty input box
		var sku = $row.attr('data-sku'); //Get the sku from the attribute
		if(!sku) //If there is no sku
		{
			$(e).val(0); //Set a qty of 0 
			return; //Finish becuase it is not a valid row yet
		}
		
		var n = parseInt( $(e).val(), 10 ); //Parse the number from the qty box

		if( isNaN(n) || n < 0)	//If it is an invalid number
			$(e).val( values.items[sku].number ); //Revert to the last acceptable number as loaded from the values object
		else if(n == 0) //If changed the qty to 0
			deleteRow($row);  //Remove the row
		else
			values.items[sku].number = n; //Accept the new qty value and keep in our values object

		calculateTotals(); //Recalculate the whole merch form
	}
	
	/*
	 * Called when a change to the discount box occurred. 
	 * e: the element of the discount input box element
	 */ 
	function applyDiscount(e) { 
		var $row = $(e).parents('tr').first(); // Find the row of the merch of the element passed in
		var sku = $row.attr('data-sku'); //get the sku from the sku attribute on the row
		if(!sku) //If there is not a sku yet set
		{
			$(e).val('0.00'); //Reset the discount to 0
			return; //Finish becuase it is not a valid row yet
		}
		
		var disc = parseFloat( $(e).val(), 10); //Find the discount amount 
		//Find the max discount as set by the calc function. This value is unit price
		var max = parseFloat( $(e).attr('data-max'), 10); 
		var discToApply; //To hold the discount that will be used
		
		if( isNaN(disc) || disc < 0 ) //If the discount is an invalid number
			discToApply = 0 //Reset the discount to 0
			
		else if(disc > max) //If it is too high of a discount
			discToApply = max; //Use the max discount allowed
			
		else
			discToApply = disc;//Use the discount amount givent	
		
		// Apply the discount to our form
		$(e).val( discToApply.toFixed(2) ); //Set the discount amount on the form
		values.items[sku].discount = disc; //Set the disocunt amount in our values oject
		
		calculateTotals(); //Recalculate our whole form
	}
	
	/*
	 * Adds a new row to the merch table
	 */
	var addMerchRow = function(){
		if( $('table.items tbody tr:not([data-sku])').length == 0 ) //if there is not a blank row already
		{
			//Will hold pieces of the new row and then append all together
			var row = [];			
			
			//Make the new row
			row.push("<tr>");
			row.push('<td><div><a href="#" class="del">X</a></div></td>');
			row.push('<td><input class="sku" type="text"/></td>');
			row.push('<td><center><span class="color"/></center></td>');
			row.push('<td><center><span class="size"/></center></td>');
			row.push('<td class="floating"><span class="desc" /></td>');
			row.push('<td>$<span class="unit">0.00</span></td>');
			row.push('<td><input class="qty" maxlength="3" type="text" value="0" /></td>');
			// row.push('<td data-permissions="discount">$<input type="text" class="discount" value="0.00" /></td>');
			row.push('<td>$<span class="amt">0.00</span></td>');			
			row.push('</tr>');
			
			//The newly created but not yet inserted jquery merch row
			var $row = $(row.join("")); 
		
			// Add Input listeners
			$row.find('a.del').click(function() { deleteRow( $(this).parents('tr').first() ); });
			
			$row.find('input.sku').bind('keydown', function(e){ 
				if(e.keyCode == 13)  applySku(this); 
			}).bind('keyup', function(e){  e.stopPropagation();  });
			
			$row.find('input.qty').bind('keydown', function(e){ 
				if(e.keyCode == 13) applyQty(this); 
				return CE.util.isNumberCode(e.keyCode); 
			}).bind('change', function(e){  applyQty(this); });
			
			$row.find('input.discount').bind('keydown', function(e) { 
				if(e.keyCode == 13) applyDiscount(this);
				return CE.util.isNumberCode(e.keyCode)  || e.keyCode == 190; 
			}).bind('change', function(e) { applyDiscount(this); });
	
			$('table.items tbody').append( $row ); //Append the row to the form table
		}
		
		focusSku(); //Set current focus on the sku input element
	}	
	
	/* 
	 * Find the empty merch row and set focus on the sku input box element
	 */
	function focusSku() { 
		$('table.items tbody tr').last().find('.sku').focus();
	}
	
	/*
	 * Delet the row as passed in by the jquery tr element 
	 */
	function deleteRow($row) {
		delete values.items[ $row.attr('data-sku') ]; //Delete the entry from our values object
		$row.remove();  //Remove the row from the form
		calculateTotals();  //Recalculate the form
	 }
	/*********** END MERCHANDISE METHODS *************/
	
	
	/************ START PAGE CALCULATOR **********/
	/*
	 * Called whenever the form needs to be recalculated and totals need to be updated.
	 */
	var calculateTotals = function() { 
		values.subtotal = 0; //Reset the subtotal to 0 to increment
		values.tax = 0; //Reset tax to inrememnt
		values.discount = 0; //Rest total discounts to 0
		values.tier = $('select#price_tiers').val(); //Set the current pricebook id in our values object
		
		// Loop through the table of merch entries that have been accepted and approved
		$('table.items tr[data-sku]').each(function() { 
			var m = values.items[ $(this).attr('data-sku') ]; //Get the merch object from the values object
			var amt, qty, sub, disc; //Setup variables to use
			
			// Find the unit price to be used for this entry based on the pricebook id
			for(var i in m.prices) 
				if(m.prices[i].price_book_id == values.tier)
					amt = m.prices[i].amount.toFixed(2);
			
			// Validate amount from pricebook
			if(typeof amt == "undefined") //unit price is not set because pricebook is not found. We must use the default pricebook, if any
				for(var i in m.prices) //Loop through them all again
					if(m.prices[i].is_default) //use default price book
						amt = m.prices[i].amount.toFixed(2);  //Get the unit price as a String
						
			// If we cannot find the desired price or a default price, log the error and alert the user. 
			if(typeof amt == "undefined")
			{
				CE.log.error("No available prices found for product in current pricing tier", {
					product: m,
					tier: values.tier
				});
				CE.util.alert("Price Lookup Error", "Could not find a valid price for " + m.name + ". <br />Please choose a different price level or contact your administrator.");
			}
			
			$(this).find('input.discount').attr('data-max', amt); //Set the max discount to the amount of the unit price
			$(this).find('span.unit').text( amt ); //Set the unit price span element
			
			// disc = parseFloat( $(this).find('input.discount').val() );//Find the discount amount from the input element
			qty = parseInt( $(this).find('input.qty').val() ); //find quantity amount from input element
			// sub = (amt - disc) * qty;
			sub = amt * qty; // Calc total for row without discount
			$(this).find('span.amt').text(sub.toFixed(2)); //set subtotal on line item

			values.subtotal += sub; //add subtotal to the overall subtotal
			values.discount += disc * qty;
			//If(taxable) tax += subtotal * <tax %> //calc tax
		});

		$('#discount').text( values.discount.toFixed(2) );	//Set the total discount box on the form
		$('#subtotal').text( values.subtotal.toFixed(2) ); //Set the total subtotal amount on the form
		$('#tax').text( values.tax.toFixed(2) ); //Set the total tax amount on the form
		$('#total').text( (values.subtotal + values.tax).toFixed(2) ); //Set the total total amount on the form

		if( values.subtotal + values.tax > 0 ) // if there is a total
			CE.util.enable( $('#checkout') ); //Enable checkout button
		else
			CE.util.disable( $('#checkout') );//Disable checkout button
	}
	/************ END PAGE CALCULATOR **********/
	
	ce_.main = {
		logout : function(){ chrome.app.window.current().close(); }
	}
	
	return ce_;

})(CE || {});





