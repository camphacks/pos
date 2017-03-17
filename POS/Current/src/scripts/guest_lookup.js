(function() { 
	"use strict";
	
	function guestlookupInit()
	{
		if(typeof CE.POS != 'undefined')
			initializeGuestlookup();
		else
			setTimeout(guestlookupInit, 100);
	}
	
	$(document).ready(function() {
		guestlookupInit();
	});
	
	function initializeGuestlookup()
	{
		/* Listeners */
		$('button#find').click(query);
		$('input').keydown(function(e) { if(e.keyCode == 13) query(); });

		$('table#items').hide();
		$('#emptyMessage').hide();		
		$('#fname').focus();
		
		CE.util.loader.start();
		console.log('doing POS SYNC...');
		CE.POS.sync(0,1).then(function() { initDefault(); }).always(CE.util.loader.stop);
		// comment out function below
		//initDefault();
	}
	
	function initDefault()
	{
		console.log('in initDefault');
		if(typeof loaded_name == "string") //initialized with search
		{
			var names = loaded_name.split(' ');
			$('#fname').val( names[0] );

			if(names.length > 1)
				$('#lname').val( names[1] );
			query();
		}		
	}
	
	function selectGuest($row) { 
		if($row)
		{
			var id = $row.attr('data-id');
			var enabled = $row.attr('data-enabled');
			if(id && id.length > 0 && enabled.bool())
			{
				if( typeof apply == 'function')
				{
					apply( id );
					chrome.app.window.current().close();
				}
				else
				{
					throw "Could not locate call back function";
				}
			}
		}
	}
	
	function query() {

		var fname = $('#fname').val();
		var lname = $('#lname').val();
		
		var promise = $.when(searchForIn(fname, 'first_name'), searchForIn(lname, 'last_name'));
		promise.done(function(fnames, lnames) { 
			var inter = CE.util.intersect.objects(fnames, lnames, 'id');

			$('#initMessage').hide();
			$('table#items').hide();
			$('#emptyMessage').hide();
			
			if(inter && inter.length > 0)
			{
				buildResults(inter);
				$('table#items').show();
			}
			else if(fname.length > 0 || lname.length > 0)
			{
				$('#emptyMessage').show();
			}
			else
			{
				$('#initMessage').show();
			}		
		});
		promise.fail(function(e) { console.log(e); });		
	}
	
	function buildResults(guests) { 
		var res = [];

		for(var i in guests)
		{
			var g = guests[i];
			var open = isOpen(g);
			
			res.push('<tr data-enabled="' + open + '" data-id="' + (g.id || ' ') + '">');
			res.push('<td>' + (open ? '<button class="discrete" data-role="select" >Select</button>' : '') + '</td>');
			res.push('<td><span>' + (g.first_name || ' ') + '</span></td>');
			res.push('<td class="floating"><span>' + (g.last_name || ' ') + '</span></td>');
			res.push('<td><span>' + ( new Date(g.birth_date).pretty() || '') + '</span></td>');
			res.push('<td><span>' + (g.event_name || ' ') + '</span></td>');
			res.push('<td><span class="message' + (open ? '' : ' error') + '">' + ( open ? 'OPEN' : 'CLOSED' ) + '</span></td>');
			res.push('</tr>');
		}
		
		var tableData = res.join('');

		$('table#items tbody').html( tableData );
		$('button[data-role=select]').click(function() { selectGuest( $(this).parents('tr').first() ); });
		$('.items tbody tr').dblclick(function() { selectGuest( $(this) ); });	
	}
	
	function isOpen(account) { 
		return true;/*
		var now = clearTime(new Date()),
			start = clearTime(account.event_start_date),
			end = clearTime(account.event_end_date);
		
		return now >= start && now <= end;*/
	}

	function clearTime(dt){
		var d = new Date(dt);
		d.setHours(0,0,0,0);
		return d.getTime();
	}
	
		
	
	
	//	var SORT_PROPERTY = 'last_name_lc';
	//	intersect.sort( function(a,b) { return a[SORT_PROPERTY] > b[SORT_PROPERTY]; } );
		
	function searchForIn(q,i) {
		if(q && q.length > 0)
			return CE.DB.accounts.find[i](q);
		return $.Deferred().resolve();
	}
	
	
})();