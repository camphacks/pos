window.addEventListener('load', 
	function(){
		//Wait until the stack has cleared
		window.setTimeout(function(){
			window.data = window.data || {};
			
			//Get the content to have on this alert
			var t = window.data.title || "Camp Eagle - Point of Sale:";
			var m = window.data.message || "";
			
			console.log(t);
			console.log(m);
			
			//Inject the content into the DOM
			document.getElementById('title').innerHTML = t.toString();
			document.getElementById('message').innerHTML = m.toString();
			
			//Listen for clicks on the button
			var button = document.getElementById('ok');
			button.addEventListener('click', function() { chrome.app.window.current().close() } );
			
			//Focus the button for a quick and easy enter-press
			button.focus();
		}, 0);
	}	
);
