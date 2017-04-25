(function(){
	"use strict"
	
	//var values  = {} - object from creator with transaction information
	
	/**
	 * This block runs at load. 
	 * It is responsible for verifying it has a good state when it is launched if not, it closes.
	 * It registers listener handlers for typing values into the amount input boxes.
	 * It listens for a CC swipe
	 * It tries to apply intermediate payments when any input boxes change value
	 * It initializes the main content section when the URI #hash changes based on left sidebar buttons
	 * It disables all payment methods that are not allowed. 
	 * It initializes the total for the checkout process
	 * It shows the appropriate warnings if it is a return checkout
	 */
	$(document).ready(function() { 	
		if( typeof values == "undefined" || values.items.length == 0 || values.subtotal == 0)
			chrome.app.window.current().close();
		/* END INITIALIZE WINDOW SHOW/HIDE */		
		
		
		/* START LISTENERS */
		$('body, input[data-name=amount]').keypress( function(e) {if (e.keyCode == 13)  apply( $(this).parents('.toggle'), true ); });	
		$('input[data-name=amount]').keydown(function(e) { return CE.util.isNumberCode(e.keyCode) || e.keyCode == 190 || e.keyCode == 13; }); //numbers or ctrl chars or period or enter}, true);
		cc.listen(); //listen on entire document for cc swipe
		
		$('input').change( function() { apply( $(this).parents('.toggle') ); });
		$('button.clear').click(function() { clear( $(this).parents('.toggle') ); });	
		window.addEventListener('hashchange', initializeSection);
		CE.util.hotkeys();		
		/* END LISTENERS */


		/* START SETUP FUNCTIONALITY */
		disableMethods(); //Methods available in context
		if(values && values.account)
		{
			$('input[data-name=camp_account_id]').val( values.account.id );
			loadAccount();
		}
		/* END SETUP FUNCTIONALITY */
		
				
		/* START NUMBERS SETUP */
		$('span[data-name=total]').text( (values.subtotal + values.tax).toFixed(2) ); //never changes
		calc(); // calc and enable checkout 
		$('a[data-name=cash]').focus(); 
		/* END NUMBERS SETUP */
		
		
		if(values.isReturn)
			$('body').attr('data-mode', 'return');
	});
	
	/**
	 * This method initialzes the account on the account section
	 * Called once at page load
	 */
	function loadAccount() { 
		// Get the amount available in the account
		var amt = (values.account.amount).toFixed(2); 
		
		//Set the max amount as an attribute and on change it recalculates and start the input box at 0
		$('#account input[data-name=amount]').attr('data-max', amt).change(calcAccount).val(0);
		
		// The current balance text is set the amount in the account
		$('#current-balance').text( amt );
		
		//Recalcuate everthing
		calcAccount();
	}
	
	/**
	 * Calculate the account values
	 */
	function calcAccount(){
		var $inp = $('#account input[data-name=amount]');
		var max = parseFloat( $inp.attr('data-max') );
		var val = parseFloat( $inp.val() );
		
		if( (isNaN(val) || val > max) && val > 0 && !values.isReturn )
			CE.util.confirm('Balance Exceeded', 'The amount being charged is more than the balance on this account. Please inform the customer to use cash or credit.', {ok: "Ok"})
				.fail(function(){ $inp.val( Math.max(max, 0).toFixed(2) ); $inp.trigger('change'); });

		/*if( (isNaN(val) || val > max) && val > 0 && !values.isReturn )
			CE.util.confirm('Balance Exceeded', 'The amount being charged is more than the balance on this account. Are you sure you want to continue?', {ok: "Yes", cancel: "No"})
				.fail(function(){ $inp.val( Math.max(max, 0).toFixed(2) ); $inp.trigger('change'); });*/
					
		var dif = max - (values.isReturn ? -val : val);
		$("#remaining-balance").text( dif.toFixed(2) );
	}
	
	/**
	 * Called when a primarywindow is switched to (i.e. Account, Check, Credit Card...)
	 */
	 var paymentType = '';
	function initializeSection() {
			
		var id = window.location.hash;
		
		switch(id)
		{
			case '#card' : paymentType = 'card'; break;
			case '#cash' : paymentType = 'cash'; break;
			case '#check' : paymentType = 'check'; break;
			case '#account' : paymentType = 'account'; break;
			// case '#department' : paymentType = 'department'; break;
		}
		
		if(id == '#checkout')
		{
			// launchEmailReceipt window
			// upon return/callback, call checkout
			console.log(paymentType);
			//if(paymentType == 'card')
			if(navigatorOnLine)
				launchEmailReceipt();
			else
				checkout();
			return;
		}
		
		if(id == '#error')
			return;
		
		var input = $(id).find('input[data-name=amount]');
		var def = input.attr('data-default').bool();
		var init = input.attr('data-applied');
		var val;

		if(init && init.bool()) //dont initialize the amount on an applied section
		{
			val = parseFloat( input.val() );
		}
		else if( def ) //should apply the remaining amount
		{
			val = calc()
			val = val < 0 ? 0 : val;
		}
		else //
		{
			val = 0;			
		}
		
		input.val( val.toFixed(2) ).focus().select().trigger('change');
	}

	function clear($sect){ 
		 $sect.find('input').val('').removeAttr('disabled');
		 $sect.find('input[data-name=amount]').val( '0.00' );
		 apply($sect);
	}
	
	function checkout() {
		//Show loading GIF
		CE.util.loader.start();
		
		//Verify all calculations before checkout
		calc(); 
		
		//If we are not ready for checkout due to invalid payments state
		if(!values.checkout_enabled)
		{
			//Stop the loader
			CE.util.loader.stop();
			return; //Quit
		}
		
		//Use a form maker to get the payment types and fields	
		var tenders = makeTenderObjects();
		
		//If we have change when we are checking out,
		//make sure to substract it from our chash amount
		if(values.calc.change && values.calc.change > 0)
			tenders.payment.cash.amount -= values.calc.change;
		
		//Generate a temporary total
		var total = values.subtotal + values.tax;
		
		//TIM: added email for email receipt
		console.log('checkout email: ' + values.email);

		var mac = '';
		var promise;
		// TIM: get the machine id
		CE.DB.settings.get('machine_id').done(function(vals)
		{
			mac = vals.machine_id;
			console.log('mac in done: ' + mac);
			console.log('values:');
			console.log(values);
			console.log('stringified: ' + JSON.stringify(values));
			//Try to make the transaction
			promise = CE.POS.transaction(total, values.items, tenders, values.isReturn, values.tier, values.invoice, mac, values.email);
		
		
		//If the transaction goes through, 
		//We need to tell the user and print the receipt(s)
		promise.done(function(local_id) {
			console.log(local_id);
			//Print the receipt
			//launchReceipt(local_id); TIM
			
			//Will hold the message for the alert
			var alertMsg, alertTitle;
			
			//If we have cash to give the customer
			if(values.calc.change > 0 && !values.isReturn)
			{
				alertTitle = '<h2>Change</h2>';
				alertMsg   = '<h3>Change is: ' + values.calc.change.money() + '</h3>';
			}
			
			//If we have cash to give the customer for the cash refund
			else if(values.isReturn && tenders.payment.cash)
			{
				alertTitle = '<h2>Refund</h2>';
				alertMsg = '<h3>Refund amount is: ' + tenders.payment.cash.amount.money() + '<h3>';
			}

			//If we have values for the alert (i.e. we need to alert the user of something
			if(typeof alertTitle === "string" && typeof alertMsg === "string" && alertMsg.length + alertTitle.length > 0)
				CE.util.alert(alertTitle, alertMsg);
			
			//Close the window
			chrome.app.window.current().close();
			
			//The caller may have specified a callback sucess function.
			//Lets call it if it exists and is callable
			if(typeof window.successful == "function")
				window.successful();

		});
		
		promise.fail(function(response)
		{
			console.log(response.messages);			
			for(var i in response.messages)
			{
				var m = response.messages[i];
				if(m != null)
				{
					if(m.message.search('duplicate transaction') >= 0)
						CE.util.alert('Checkout Error', '<strong>Error: ' + m.code + '</strong></br >A transaction for the exact same amount on this exact same card was detected very recently. Please wait 2 minutes and try again.');
					else if(m.message.search('Track1 data') >= 0)
						CE.util.alert('Checkout Error', '<strong>Error: ' + m.code + '</strong></br >Our scanner had trouble reading this card. Please type in the information manually and try again.');
					else
						CE.util.alert('Checkout Error', '<strong>Error: ' + m.code + '</strong></br >' + m.message);
					CE.log.error(m.message, m.code);
				}
				CE.util.alert('Checkout Error', '<strong>Error:</strong><br/>There was an error processing this transaction. Please check funds and try again later.');
				console.log('promise ERROR: ' + m);
			}
			if(response != null)
			{
				if(response.responseText != null)
				{
					if(response.responseText.search(/pricebook/i) >= 0)
						CE.util.alert('Checkout Error', '<strong>Error:</strong><br/>There is a problem with an item in the cart. Please report the items currently in the cart to your supervisor. Please remove items and try again.');
				}
			}
			window.top.location.hash = '#error';
		});
		
		//Always stop the loader when the transaction is done
		promise.always(CE.util.loader.stop);
		});
	}
	
	// TIM: RECEIPT PAGE FOR CC CHECKOUTS
	function launchEmailReceipt() { 
		chrome.app.window.create('email_receipt.html', {
				id: "email_receipt",
				minWidth: 1000,
				minHeight: 580,
				resizable: false,							
			}, function(win) { 
				win.contentWindow.apply = applyEmail;
				win.contentWindow.proceedWithCheckout = checkout;
				win.contentWindow.values = values;
				win.contentWindow.CE = $.extend({}, {util: {}}, CE);				
				//win.contentWindow.successful = function() { newOrder(); };
		});
	}	
	// TIM: add function for setting email from email receipt page
	function applyEmail(em)
	{
		values.email = em;
		console.log('values : ' + values.email);
	}
	
	/* 
	 * This method is passed a transaction id and opens a receipt page and passes it the id to load
	 */
	function launchReceipt(transaction_id) { 
		chrome.app.window.create('receipt.html', {
				id: "receipt",
				minWidth: 300,
				minHeight: 500,
				hidden: false//true TIM
			}, function(win) {
				//Load hidden
				win.hide(); // TIM maybe get rid of this to keep receipt on screen
				
				// Copy CE object for functionality
				win.contentWindow.CE = $.extend({}, {util: {}}, CE);

				// Copy the transaction id to load
				win.contentWindow.loaded_sale_id = transaction_id;
		});		
	}
	
	function makeTenderObjects() { 
		var root = $('[data-role=root]');
		var tenders = CE.util.buildForm( root );
	
		for(var i in tenders.payment)
			if( !validTender( $('div[data-name=' + i + '].toggle') ) )
				delete tenders.payment[i];
		
		return tenders;
	}
	
	function apply($sect, shouldFocusCheckout){
	
		if( validTender($sect) )
		{
			var amt = parseFloat( $sect.find('input[data-name=amount]').val() );
	
			$sect.find('input[data-name=amount]').val( amt.toFixed(2) ); //set input as fixed
		
			var $tot = $('span[data-source=tenders][data-name=' + $sect.attr('id') + ']'); //get the totals on the right col
			$tot.text(amt.toFixed(2)); //set totals as fixed
	
			$tot.parents('tr').first().show();
			
			$sect.find('input[data-name=amount]').attr('data-applied', 'true');
		}
		else
		{
			var $tot = $('span[data-source=tenders][data-name=' + $sect.attr('id') + ']'); //get the totals on the right col		
			$tot.text('0.00');
			$tot.parents('tr').first().hide();
			$sect.find('input[data-name=amount]').attr('data-applied', 'false');			
		}
		calc(shouldFocusCheckout);		
	}
	
	function calc(shouldFocusCheckout) { 
		var total = (+values.subtotal.toFixed(2)) + (+values.tax.toFixed(2));

		var tenders = 0;
		var availableChange = 0;
		$('span[data-source=tenders]').each(function() { 
			var amt = parseFloat( $(this).text() );
			if(!isNaN(amt))
			{
				tenders += amt;

				var cng = $(this).attr('data-change');
				if( cng && cng.bool() )
					availableChange += amt;
			}
		});
		
		var overpay = Math.max(tenders - total, 0) 
		var change = +Math.min( overpay, availableChange ).toFixed(2); 

		var cashBack = change < overpay; //cannot have cashBack
		var remaining = cashBack ? (change - overpay) : Math.max(total - tenders, 0);

		$('span[data-name=remaining]').text( remaining.toFixed(2) );
		$('span[data-name=change]').text( change.toFixed(2) );
		
		values.calc = {
			"remaining" : remaining,
			"change" : change,
			"total" : total
		}
		
		/* valid for checkout */
		if( (total + change) ==  tenders && (!values.isReturn || change == 0))  //cannot have change if it is a return
		{
			CE.util.enable( $('a[data-name=checkout]') );
			values.checkout_enabled = true;
			if(shouldFocusCheckout)
			{
				$('a[data-name=checkout]').focus();
			}
		}
		/* invalid for checkout */			
		else 
		{
			CE.util.disable( $('a[data-name=checkout]') );
			values.checkout_enabled = false;
			console.log('total: ' + total);
			console.log('change: ' + change);
			console.log('tenders: ' +tenders);
		}

		
		return total - tenders;			
	}
	
	function validTender($sect) { 
		var amt = parseFloat( $sect.find('input[data-name=amount]').val() );
		if(isNaN(amt) || amt <= 0)
			return false;

		switch( $sect.attr('id') )
		{
			case 'cash': return true;
			
			case 'check': 
				var valid = true;
				if( $sect.find('input[data-name=drivers_license]').val().length == 0 )
					valid = false;
				if( $sect.find('input[data-name=check_number]').val().length == 0 )
					valid = false;					
				return valid;
				
			
			case 'account': return true;
			
			case 'card': 
				var valid = true;
				$sect.find('input[data-name=card_number], input[data-name=expiration_month], input[data-name=expiration_year]').each(function() { 
					if( $(this).val().length == 0 || !(/^\d+$/.test( $(this).val() ) ) ) //cannot be blank and numbers only
						valid = false;
				});
				
				if( $sect.find('input[data-name=name]').val().length == 0)
					valid = false;
				
				//if(!navigator.onLine)
				if(!navigatorOnLine)
				{
					if(valid)
						CE.util.alert('Offline', 'The system is currently offline. Credit Cards cannot be processed while offline');
					valid = false;
				}
				return valid;
				
			case 'department': 
				valid = true;	
				var depValue = $sect.find('#departmentList').val();
				
				if(!depValue || depValue.length == 0 )
					valid = false;
					
				return valid;
				
			default: return false;
			
		}		
	}
	
	function disableMethods() { 
		var disable = [];
		if( typeof values.account == 'undefined')
			disable.push('.account');
			
		//if(!navigator.onLine)
		if(!navigatorOnLine)
			disable.push('.card');
			
		var promise = CE.DB.session.permissions.department();
		promise.done(function(bool) { 
			if(!bool) 
				disable.push('.department'); 
			else
				loadDepartmentOptions();				
		});
		
		if(values.isReturn)
		{
			disable.push('.check');
			//We want to be able to return to a department
//			disable.push('.department');
		}
		
		if(false && !CE.print.status.isAlive)
		{
			disable.push('.card');
			disable.push('.check');
			disable.push('.cash');
			
			//Tell the user why they cannot use the above methods
			CE.util.alert('No printer connection', 'Cannot find printer controller. <br />All <strong>Cash</strong>, <strong>Check</strong> and <strong>Credit Card</strong> transactions will be disabled until the printer controller comes back online.<br /><br />Please Contact your system administrator.');
		}
		
		promise.always(function() { CE.util.disable( $( disable.join(', ') ).find('a.btn') ) });
		

	}
	
	function loadDepartmentOptions(){
		CE.log.debug("Trying to get the list of billable departments");
		CE.DB.settings.get("departments").done(function(vals){ 
			if(vals && vals.departments && vals.departments.length)
			{
				CE.log.debug("Billable departments: " + vals);
				//Get the HTML select element
				var $select = $("#departmentList");
				
				//Remove all the current select options
				$select.html("");
				
				//Add options, one for each department
				for(var i in vals.departments)
				{
					$select.append("<option value=" + vals.departments[i] + ">" + vals.departments[i].capitalize() + "</option>" );
				}
			}
		});
	}

	
	function applyCardSwipe(swipe) {
		var ccData = new SwipeParserObj(swipe);
		if(!ccData.hasTrack1)
		{
			ccData = {};
			return;
		}
		var $c = $('#card.toggle');
		$c.find('input[data-name=name]')			.val( ccData.firstname + ' '+ ccData.surname )	.attr('disabled', 'disabled');
		$c.find('input[data-name=card_number]')		.val( ccData.account )							.attr('disabled', 'disabled');
		$c.find('input[data-name=expiration_month]').val( ccData.exp_month )						.attr('disabled', 'disabled');		
		$c.find('input[data-name=expiration_year]')	.val( ccData.exp_year.right(2) )				.attr('disabled', 'disabled');
		$c.find('input[data-name=track_1]')			.val( ccData.track1 );
		$c.find('input[data-name=track_2]')			.val( ccData.track2 );

		window.location.hash = 'card';
		window.setTimeout( function(){ apply( $c ); } , 0);
	}
		
	/* object manages cc input event and determining if a sequence of entered numbers is a cc swipte or not */
	var cc = {timeout: 0, value: "", reading: false, listen: function() { document.body.addEventListener('keypress', cc.listener, true); },  listener: function(e){
		console.log("received info");
		if(e)
		{
		
				console.log("received info with event");
			if( !cc.reading ) //can only become in a reading state if it a % is typed
			{
				if( String.fromCharCode(e.which) == '%') 
				{
					cc.reading = true;
					cc.value = '';
					cc.timeout = new Date().getTime();	
					document.activeElement.blur();
				}
			}
			if( cc.reading)
			{		
				console.log("received letter while reading- keycode: " + e.keyCode);
				var interval = new Date().getTime() - cc.timeout;
				//console.log('interval: ' + interval);
				if(interval <= 2000)
				{
					if(e.keyCode == 13) //code 13 = carriage return
					{
						console.log("received track");
						if( cc.value.indexOf( String.fromCharCode(13) ) != -1 )//finished track two (there is already a carriage return
						{
							cc.reading = false; //done reading
							applyCardSwipe(cc.value); //jumpout and parse swipe
							return;
						}		
					}
					cc.value += String.fromCharCode(e.which); // add the value to the string
					e.stopPropagation(); //stop from further effect on page
					e.stopImmediatePropagation(); 
					e.preventDefault();
				}
				else //timeout occurred
				{
					cc.reading = false;
					cc.listener(e); //could previously be being read and timeout and now being read again
				}
			}
		}
	}};

})(); 