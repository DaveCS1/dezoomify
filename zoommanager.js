var UI = {};
UI.canvas = document.getElementById("rendering-canvas");
UI.dezoomers = document.getElementById("dezoomers");

/** Adjusts the size of the image, so that is fits page width or page height
**/
UI.changeSize = function () {
	var width = UI.canvas.width, height = UI.canvas.height;
	switch (this.fit) {
		case "width":
			this.fit = "height";
			UI.canvas.style.height = window.innerHeight + "px";
			UI.canvas.style.width = window.innerHeight / height * width + "px";
			break;
		case "height":
			this.fit = "none";
			UI.canvas.style.width = width + "px";
			UI.canvas.style.height = height + "px";
			break;
		default:
			this.fit = "width";
			UI.canvas.style.width = window.innerWidth + "px";
			UI.canvas.style.height = window.innerWidth / width * height + "px";
	}
};
/** Sets the width and height of the canvas
**/
UI.setupRendering = function (data) {
	document.getElementById("status").className = "loading";
	UI.canvas.width = data.width;
	UI.canvas.height = data.height;
	UI.canvas.onclick = UI.changeSize;
	UI.ctx = UI.canvas.getContext("2d");
	UI.changeSize();
};

UI.drawTile = function(tileImg, x, y) {
	UI.ctx.drawImage(tileImg, x, y);
};

UI.error = function(errmsg) {
	if (errmsg) {
		document.getElementById("errormsg").textContent = errmsg;
	}
	document.getElementById("percent").textContent = "";
	document.getElementById("error").removeAttribute("hidden");
};
window.onerror = function(errmsg, source, lineno) {
	UI.error(errmsg + ' (' + source + ':' + lineno + ')');
}

UI.reset = function() {
	document.getElementById("error").setAttribute("hidden", "hidden");
	document.getElementById("status").className = "";
	UI.canvas.width = UI.canvas.height = 0;
};

UI.updateProgress = function (percent, text) {
	document.getElementById("percent").innerHTML = text + ' (' + parseInt(percent) + "%)";
	document.getElementById("progressbar").style.width = percent + "%";
};

UI.loadEnd = function() {
	var status = document.getElementById("status");
	var a = document.createElement("a");
	a.download = "dezoomify-result.jpg";
	a.href = "#";
	a.textContent = "Converting image...";
	a.className = "button";
	try {
		// Try to export the image
		UI.canvas.toBlob(function(blob){
			var url = URL.createObjectURL(blob);
			a.href = url;
			a.textContent = "Save image";
		}, "image/jpeg", 0.95);
		status.className = "download";
		status.appendChild(a);
	} catch(e) {
		status.className = "finished";
	}
};

UI.addDezoomer = function(dezoomer) {
	var label = document.createElement("label")
	var input = document.createElement("input");
	input.type = "radio"
	input.name = "dezoomer";
	input.id   = "dezoomer-" + dezoomer.name;
	label.title= dezoomer.description;
	input.onclick = function() {
		ZoomManager.setDezoomer(dezoomer);
	}
	label.appendChild(input);
	label.appendChild(document.createTextNode(dezoomer.name));
	UI.dezoomers.appendChild(label);
};

UI.setDezoomer = function(dezoomerName) {
	document.getElementById("dezoomer-"+dezoomerName).checked = true;
}

var ZoomManager = {};

ZoomManager.error = function (errmsg) {
	UI.error(errmsg);
	throw new Error(errmsg);
};

ZoomManager.updateProgress = function (progress, msg) {
	UI.updateProgress(progress, msg);
};
ZoomManager.loadEnd = function () {
	UI.loadEnd();
}

ZoomManager.startTimer = function () {
	var wasLoaded = 0; // Number of tiles that were loaded last time we watched
	var timer = setInterval(function () {
		/*Update the User Interface each 500ms, and not in addTile, because it would
		slow down the all process to update the UI too often.*/
		var loaded = ZoomManager.status.loaded, total = ZoomManager.status.totalTiles;
		if (loaded !== wasLoaded) {
			// Update progress if new tiles were loaded
			ZoomManager.updateProgress(100 * loaded / total, "Loading the tiles...");
			wasLoaded = loaded;
		}
		if (loaded == total) {
			clearInterval(timer);
			ZoomManager.loadEnd();
		}
	}, 500);
	return timer;
};


ZoomManager.readyToRender = function(data) {

	data.nbrTilesX = data.nbrTilesX || Math.ceil(data.width / data.tileSize);
	data.nbrTilesY = data.nbrTilesY|| Math.ceil(data.height / data.tileSize);
	data.totalTiles = data.totalTiles || data.nbrTilesX*data.nbrTilesY;
	data.zoomFactor = data.zoomFactor || 2;
	data.baseZoomLevel = data.baseZoomLevel || 0;

	ZoomManager.status.totalTiles = data.totalTiles;
	ZoomManager.data = data;
	UI.setupRendering(data);

	ZoomManager.updateProgress(0, "Preparing tiles load...");
	ZoomManager.startTimer();

	var render = ZoomManager.dezoomer.render || ZoomManager.defaultRender;
	setTimeout(render, 1, data); //Give time to refresh the UI, in case render would take a long time
};

ZoomManager.defaultRender = function (data) {
	var zoom = data.maxZoomLevel || ZoomManager.findMaxZoom(data);
	var x=0, y=0;

	function nextTile() {
		var url = ZoomManager.dezoomer.getTileURL(x,y,zoom,data);
		if (data.origin) url = ZoomManager.resolveRelative(url, data.origin);
		ZoomManager.addTile(url, x*data.tileSize, y*data.tileSize);

		x++;
		if (x >= data.nbrTilesX) {x = 0; y++;}
		if (y < data.nbrTilesY) ZoomManager.nextTick(nextTile);
	}

	nextTile();
};
ZoomManager.nextTick = (function(doAnim) {
	if (doAnim) return function(f){return requestAnimationFrame(f)}
	else return function(f) {return setTimeout(f, 5)}
})(!!window.requestAnimationFrame);

ZoomManager.addTile = function (url, x, y) {
	//Demande une partie de l'image au serveur, et l'affiche lorsqu'elle est reçue
	var img = new Image;
	img.addEventListener("load", function () {
		UI.drawTile(img, x, y);
		ZoomManager.status.loaded ++;
	});
	img.addEventListener("error", function() {
		ZoomManager.error("Unable to load tile: " + url);
	});
	if (ZoomManager.proxy_tiles) {
		url = ZoomManager.proxy_tiles + "?url=" + encodeURIComponent(url);
		img.crossOrigin = "anonymous";
	}
	img.src = url;
};

ZoomManager.open = function(url) {
	ZoomManager.init();
	if (url.indexOf("http") !== 0) {
		throw new Error("You must provide a valid HTTP URL.");
	}
	if (typeof ZoomManager.dezoomer.findFile === "function") {
		ZoomManager.dezoomer.findFile(url, function foundFile(filePath) {
			ZoomManager.dezoomer.open(ZoomManager.resolveRelative(filePath, url));
		});
	} else {
		ZoomManager.dezoomer.open(url);
	}
};

/**
 * Call callback with the contents of the page at url
 */
ZoomManager.getFile = function (url, params, callback) {
	var PHPSCRIPT = ZoomManager.proxy_url;
	var type = params.type || "text";
	var xhr = new XMLHttpRequest();

	// The url we got MIGHT already have been encoded
	// The url we give to the server MUST be encoded
	if (url.match(/%[a-zA-Z0-9]{2}/) === null) url = encodeURI(url);
	// We pass the URL itself as a query parameter, so we have to re-encode it
	var codedurl = encodeURIComponent(url);
	var requesturl = PHPSCRIPT + "?url=" + codedurl;
	if (ZoomManager.cookies.length > 0) {
		requesturl += "&cookies=" + encodeURIComponent(ZoomManager.cookies);
	}
	xhr.open("GET", requesturl, true);

	xhr.onloadstart = function () {
		ZoomManager.updateProgress(1, "Sent a request in order to get informations about the image...");
	};
	xhr.onerror = function (e) {
		throw new Error("Unable to connect to the proxy server to get the required informations. XHR error: " + e);
	};
	xhr.onloadend = function () {
		var response = xhr.response;
		var cookie = xhr.getResponseHeader("X-Set-Cookie");
		if (cookie) ZoomManager.cookies += cookie;
		// Custom error message on invalid XML
		if (type === "xml" &&
				response.documentElement.tagName === "parsererror") {
			return ZoomManager.error("Invalid XML: " + url);
		}
		// Custom error message on invalid JSON
		if (type === "json" && xhr.response === null) {
			return ZoomManager.error("Invalid JSON: " + url);
		}
		// Decode html encoded entities
		if (type === "htmltext") {
			response = ZoomManager.decodeHTMLentities(response);
		}
		callback(response, xhr);
	};

	switch(type) {
		case "xml":
			xhr.responseType = "document";
			xhr.overrideMimeType("text/xml");
			break;
		case "json":
			xhr.responseType = "json";
			xhr.overrideMimeType("application/json");
			break;
		default:
			xhr.responseType = "text";
			xhr.overrideMimeType("text/plain");
	}
	xhr.send(null);
};

ZoomManager.decodeHTMLentities = (function (){
	var dict = {
		"&amp;": "&",
		"&lt;": "<",
		"&gt;": ">",
		"&quot;": "\"",
		"&#x27;": "'",
		"&#x60;": "`"
	};
	var regEx = /(?:&amp;|&lt;|&gt;|&quot;|&#x27;|&#x60;)/g;
	function replacer(entity) {return dict[entity];}

	return function decodeHTMLentities (text) {
		return text.replace(regEx, replacer);
	};
})();

/**
 * Return the absolute path, given a relative path and a base
 */
ZoomManager.resolveRelative = function resolveRelative(path, base) {
	// absolute URL
	if (path.match(/\w*:\/\//)) {
		return path;
	}
  // Protocol-relative URL
	if (path.indexOf("//") === 0) {
		var protocol = base.match(/\w+:/) || ["http:"];
		return protocol[0] + path;
	}
	// Upper directory
	if (path.indexOf("../") === 0) {
		return resolveRelative(path.slice(3), base.replace(/\/[^\/]*$/, ''));
	}
	// Relative to the root
	if (path[0] === '/') {
		var match = base.match(/(\w*:\/\/)?[^\/]*\//) || [base];
		return match[0] + path.slice(1);
	}
	//relative to the current directory
	return base.replace(/\/[^\/]*$/, "") + '/' + path;
};

/** Returns the maximum zoom level, knowing the image size, the tile size, and the multiplying factor between two consecutive zoom levels
**/
ZoomManager.findMaxZoom = function (data) {
	//For all zoom levels:
	//size / zoomFactor^(maxZoomLevel - zoomlevel) = numTilesAtThisZoomLevel * tileSize
	//For the baseZoomLevel (0 for zoomify), numTilesAtThisZoomLevel=1
	var size = Math.max(data.width, data.height);
	return Math.ceil(Math.log(size/data.tileSize) / Math.log(data.zoomFactor)) + (data.baseZoomLevel||0);
};

ZoomManager.dezoomersList = {};
ZoomManager.addDezoomer = function(dezoomer) {
	ZoomManager.dezoomersList[dezoomer.name] = dezoomer;
	UI.addDezoomer(dezoomer);
}

ZoomManager.setDezoomer = function(dezoomer) {
	ZoomManager.dezoomer = dezoomer;
	UI.setDezoomer(dezoomer.name);
}
ZoomManager.reset = function() {
	// This variable will store cookies set by previous requests
	ZoomManager.setDezoomer(ZoomManager.dezoomersList["Select automatically"]);
};

ZoomManager.init = function() {
	// Called before open()
	if (!ZoomManager.cookies) ZoomManager.cookies = "";
	if (!ZoomManager.proxy_url) ZoomManager.proxy_url = "proxy.php";
	ZoomManager.status = {
		"loaded" : 0,
		"totalTiles" : 1
	};
	UI.reset();
};
