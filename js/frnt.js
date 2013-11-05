(function($) {
    $.fn.uniformHeight = function() {
        var maxHeight   = 0,
            max         = Math.max;

        return this.each(function() {
			console.log($(this).height());
            maxHeight = max(maxHeight, $(this).height());
        }).height(maxHeight);
    }
})(jQuery);

$.jsonRPC.setup({
  endPoint: '/jsonrpc'
  //namespace: ''
});

// Global stuff we don't want to query/pass-through all the time... 
var IS_PLAYING = false;
var PLAYER = null;
var SPEED = null;
var CURRENT_LIBRARY = null; // Remember the library type so that we don't have to pass it through everywhere for the time being

$(document).ready(function() {
	// General...
	$("#controls .btn").tooltip();
	setActiveControls(false);
	bindControls();
	
	// Refresh player every X seconds to make sure we display the correct values...
	setInterval("getState()", 1000);
	
	// Initialize Interface if there's no !#/foo/
	if(!window.location.hash || window.location.hash == "") {
		showLibrary("movies");
	} else {
		// If we have one, remove the active stuff..
		$('.navbar-nav').children('.active').removeClass("active");
	}
	// Navigation functionality to make urls sexy and bookmarkable	
	registerNavigationHandles();
	registerTemplateFormatters();
});

var registerNavigationHandles = function(State) {
	$(window).hashchange({
        hash: "#!/movies/",
        onSet: function() {
			$('.navbar-nav').find('a[href="#!/movies/"]').parent().addClass("active");
            showLibrary("movies");
        },
        onRemove: libraryRefresh
    });
	$(window).hashchange({
        hash: "#!/tvshows/",
        onSet: function() {	
			$('.navbar-nav').find('a[href="#!/tvshows/"]').parent().addClass("active");
            showLibrary("tvshows");
        },
        onRemove: libraryRefresh
    });
};
var libraryRefresh = function() {
	$('#library').html();
	$('#loading').hide();
	$('.navbar-nav').children('.active').removeClass("active");
};

var displayModalDetails = function(response) {
	if (CURRENT_LIBRARY == "movies") {
		var details = response.result.moviedetails;	
		var itemId = "movieid";
	} else if (CURRENT_LIBRARY == "tvshows") {
		var details = response.result.tvshowdetails;
		var itemId = "tvshowid";
	} else {
		console.error(CURRENT_LIBRARY + " is not yet implemented!");
	}
	
	$('#detailTitle').text(details.title);
	
	$("#detailContent").loadTemplate("templates/"+CURRENT_LIBRARY+"-details.html", {
		details: details
    });

	/*	var castList = $('<div class="row actors"></div>');
	$.each(details.cast, function(idx, element) {
		castList.append($('<div class="col-md-2"><div class="thumbnail"><img src="/vfs/'+encodeURIComponent(element.thumbnail)+'"><div class="caption">'+element.name+'</div></div></div>'));
	});
	itemDetails.append(castList);
	$('.actors').find('.thumbnail').uniformHeight();*/
}

function showLibrary(type) {
	console.log("Loading library: '"+type+"'");
	
	CURRENT_LIBRARY = type;
	
	if (CURRENT_LIBRARY == "movies") {
		var method = "VideoLibrary.GetMovies";
		var params = { "properties": ["title", "tagline", "fanart", "thumbnail", "plot", "runtime"]};
		// "TAGLINE?", "CAST", "cast", "tagline"]
	} else if (CURRENT_LIBRARY == "tvshows") {
		var method = "VideoLibrary.GetTVShows";
		var params = { "properties": ["title", "fanart", "thumbnail", "plot"]};
	}
	
	$.jsonRPC.request(method, {
		params: params,
	 	success: function(response) {
			$('#loading').hide();
			
			var results = "";
			if (CURRENT_LIBRARY == "movies") {
				var results = response.result.movies;	
				var itemId = "movieid";
			} else if (CURRENT_LIBRARY == "tvshows") {
				var results = response.result.tvshows;
				var itemId = "tvshowid";
			} else {
				console.error(CURRENT_LIBRARY + " is not yet implemented!");
			}
			if (results.length == 0) {
				$('#library').text("No content yet!");
				return;
			} 
			var lib = $('#library');
			lib.html("<h1>Your Movies ("+results.length+")</h1>");
			
			var rows = $('<div class="row"/>');
			lib.append(rows);
			
			$.each(results, function(idx, element) {
				var thumb = $('<div data-toggle="modal" data-target="#detailModal" data-itemtype="'+CURRENT_LIBRARY+'" data-itemid="'+element[itemId]+'" class="col-sm-3 col-md-2 media-item" title="'+element.title+'"></div>');
				var link = $('<a href="#" style="height: 280px" class="thumbnail"></a>');
				var image = $('<img style="height: 230px;" src="/vfs/'+encodeURIComponent(element.thumbnail)+'" alt="'+element.title+' Thumbnail">');
				var caption = $('<div class="caption"><b>'+element.title+'</b></div>');
				
				link.append(image);
				link.append(caption);
				thumb.append(link);
				lib.append(thumb);
			});
			//TODO: $(".media-item").popover({html: true, trigger: "hover"});
			
			// Load additional data when modal is opened...
			$('#detailModal').on('show.bs.modal', function(event) {
				var button = $(event.relatedTarget);
				var itemId = button.data('itemid');
				var itemType = button.data('itemtype');
				
				if (CURRENT_LIBRARY == "movies") {
					var method = "VideoLibrary.GetMovieDetails";
					var params = { "movieid":itemId, "properties":["title", "plot", "year", "genre", "country", "director", "studio", "trailer", "playcount", "cast"]};
				} else if (CURRENT_LIBRARY == "tvshows") {
					var method = "VideoLibrary.GetTVShowDetails";
					var params = { "tvshowid":itemId, "properties":["title", "plot", "year", "genre", "studio", "playcount", "cast"]};
				} else {
					console.error(CURRENT_LIBRARY + " is not yet implemented!");
				}
				console.log(method);
				console.log(params);
				$.jsonRPC.request(method, {
					params: params,
				 	success: displayModalDetails,
					error: function(response) {
						console.error(response);
					}
				});
			});
		},
		error: function(response) {
			console.error(response);
		}
	});	
}

function getPlayingInfo(mediaType) {
	// Get details
	if (mediaType == "audio") {
		var parms = { "properties": ["title", "album", "artist", "duration", "thumbnail", "file", "fanart", "streamdetails"], "playerid": PLAYER };
	} else if (mediaType == "video") {
		var parms = { "properties": ["title", "album", "artist", "season", "episode", "duration", "showtitle", "tvshowid", "thumbnail", "file", "fanart", "streamdetails"], "playerid": PLAYER };
	} else {
		console.log("NYI/TODO");
		return
	}
	
	// Update based on value...
	$.jsonRPC.request('Player.GetItem', {
		params: parms,
	 	success: function(response) {
			var item = response.result.item;
			
			// Update text...
			$('#nowplaying').text('Now Playing: ' + item.showtitle + " - " + item.label);
			
			// Update Seekbar...
			updateSeekBar(PLAYER);
		},
		error: function(response) {
			console.error(response);
		}
	});	
	
	// Get playlist info...
	if (mediaType == "audio") {
		var parms = { "properties": ["title", "album", "artist", "duration"], "playlistid": 0 };
	} else if (mediaType == "video") {
		var parms = { "properties": [ "runtime", "showtitle", "season", "title", "artist" ], "playlistid": 1}
	} else {
		console.log("NYI/TODO");
		return
	}
	// TODO: Controls ANPASSEN
	$.jsonRPC.request('Playlist.GetItems', {
		params: parms,
	 	success: function(response) {
			//console.log(response)
		},
		error: function(response) {
			console.error(response);
		}
	});	
	
	
}

function getState() {
	// Get the active players, then get the item details if needed
	$.jsonRPC.request('Player.GetActivePlayers', {
		params: [],
	 	success: function(response) {
			if (response.result.length > 0) {
				var result = response.result[0];
				
				PLAYER = result.playerid;
				getPlayingInfo(result.type);
			} else {
				if (PLAYER != null) {
					PLAYER = null;					
					setActiveControls(false);
					updateSeekBar();
				}
			}
		},
		error: function(response) {
			console.log("GETSTATEERROR");
		}
	});
}

function speedUpdate(newSpeed) {
	//console.log("speedUpdate()");
	// Based on the speed we know whats happening...
	
	if (SPEED == newSpeed) {
		// We're already done..
		return;
	} 

	if (newSpeed >= 0) {
		setActiveControls(true);
	}
	if (newSpeed == 1 && (SPEED == 0 || SPEED == null)) {
		// Was paused, now playing
		setIsPlaying(false);
	} else if (newSpeed == 1 && SPEED > 1) {
		// Was running at higher speed, now playing
		setIsForwarding(false);
	} else if (newSpeed == 1 && SPEED < 1) {
		// Was running backward, now playing
		setIsReversing(false);
	} else if (newSpeed == 0 && SPEED > 1) {
		// Was running at higher speed, now paused
	} else if (newSpeed == 0 && SPEED < 1) {
		// Was running backward, now paused
	} else if (newSpeed == 0 && (SPEED == 1 || SPEED == null)) {
		// Was playing, now paused
		setIsPlaying(true);
		resetSeekControls();
	} else if (newSpeed > 1) {
		console.log("FASTER THAN ONE!");
		setIsForwarding(true);
	} else if (newSpeed < 1) {
		console.log("SLOWER THAN ONE!");
		setIsReversing(true);
	}
	SPEED = newSpeed;
}

function updateSeekBar() {
	if (PLAYER) {
		var parms = { "properties": ["percentage", "time", "totaltime", "speed"], "playerid": PLAYER};
		$.jsonRPC.request('Player.GetProperties', {
			params: parms,
		 	success: function(response) {
				// Update progressbar
				var pct = Math.round(response.result.percentage);
				$('#seekbar').attr("aria-valuenow", pct);
				$('#seekbar').css("width", pct+"%");
			
				speedUpdate(response.result.speed);
			
				// Set current time...
				$('#time').text(formatTime(response.result.time));
			
				// We don't need to update this every seconds.. Move it somewhere else later! TODO
				$('#totaltime').text(formatTime(response.result.totaltime));
			},
			error: function(response) {
				console.log(response);
			}
		});	
	} else {
		// Resetting...
		$('#seekbar').attr("aria-valuenow", 0);
		$('#seekbar').css("width", "0%");
	
		// Set current time...
		$('#time').text("00:00:00");
	
		// We don't need to update this every seconds.. Move it somewhere else later! TODO
		$('#totaltime').html("&infin;");
	}
}

function setActiveControls(controlState) {
	if (controlState) {
		$('#controls .btn').each(function(idx, element) {
			$(element).removeClass("disabled");
		});
	} else {
		$('#controls .btn').each(function(idx, element) {
			$(element).addClass("disabled");
		});
	}
}

function bindControls() {
	$('#control-playpause').click(function() {
		if(!$(this).hasClass("disabled")) {
			$.jsonRPC.request('Player.PlayPause', {
				params: { "playerid": PLAYER },
			 	success: function(response) {
					speedUpdate(response.result.speed);
				},
				error: function(response) {
				
				}
			});
		}
	});
	$('#control-stop').click(function() {
		if(!$(this).hasClass("disabled")) {
			$.jsonRPC.request('Player.Stop', {
				params: { "playerid": PLAYER },
			 	success: function(response) {
					speedUpdate(response.result.speed);
				},
				error: function(response) {
				
				}
			});
		}
	});
}

function pad(num, size) {
    var s = num+"";
    while (s.length < size) s = "0" + s;
    return s;
}

function formatTime(parts) {
	return pad(parts.hours, 2) + ":" + pad(parts.minutes, 2) + ":" + pad(parts.seconds, 2);
}

function setIsForwarding(isForwarding) {
	var forward = $('#control-forward');
	if (isForwarding) {
		forward.addClass('active');
	} else {
		forward.removeClass('active');
	}
}

function setIsReversing(isReversing) {
	var backward = $('#control-backward');
	if (isReversing) {
		backward.addClass('active');
	} else {
		backward.removeClass('active');
	}
}

function setIsPlaying(isPlaying) {
	var playPause = $('#control-playpause');
	var icon = playPause.children('.glyphicon').first();
	if (isPlaying) {
		icon.removeClass('glyphicon-pause', true);
		icon.addClass('glyphicon-play', true);	
	} else {
		icon.addClass('glyphicon-pause', true);
		icon.removeClass('glyphicon-play', true);		
	}
}

var registerTemplateFormatters = function() {
	console.log("REGISTERR ");
	$.addTemplateFormatter({
		// Genres aren' always formatted the same way it seems :/
	    GenreFormatter : function(value, template) {
            if (value == null) {
            	return "";
			} else if (typeof value === "array") {
				return value.join(", ");
            } else if (typeof value === "object") {
            	var genres = "";
				$.each(value, function(idx, element) {
					genres += element;
					if (value.length -1 > idx) {
						genres += ", ";
					}
				});
				return genres;
            } else if (typeof value === "string") {
            	return value.replace(/ /g, "").replace(/,/g, ", ")
            }
        },
	    TrailerFormatter : function(value, template) {
            if (value == null) {
            	return "No Trailer";
			} else {
				return '<a href="http://youtu.be/'+value.substring(value.length-11)+'" target="_blank">Watch on Youtube</1>';
			}
        },
		// TODO: Check if it's possible to use the "paged" methods from the template parser instead...
	    CastFormatter : function(value, template) {
            if (value == null) {
            	return "";
            } 
			var cast = "";
			$.each(value, function(idx, element) {
				cast += "<li><b>"+element.name+"</b> as "+element.role+"</li>";
			});
			return cast;
        },
	});
}