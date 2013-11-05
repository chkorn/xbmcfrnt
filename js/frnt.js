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

var displayMapping = {
	"movies": [
		{"title": {"name": "Title", "icon": ""}},
		{"tagline": {"name": "Tagline", "icon": null}},
		{"fanart": {"name": "Fanart", "icon": null}},
		{"thumbnail": {"name": "Thumbnail", "icon": null}},
		{"plot": {"name": "Plot", "icon": null}},
		{"runtime": {"name": "Runtime", "icon": null}}
	], 
	"tvshows": {}
};

$(document).ready(function() {
	// Navigation functionality to make urls sexy and bookmarkable
	
	registerNavigationHandles();
	
	// General...
	$("#controls .btn").tooltip();
	setActiveControls(false);
	bindControls();
	
	// Refresh player every X seconds to make sure we display the correct values...
	setInterval("getState()", 1000);
	
	// Initialize Interface if there's no !#/foo/
	if(window.location.hash || window.location.hash == "") {
		showLibrary("movies");
	}
});

var registerNavigationHandles = function(State) {
	$(window).hashchange({
        hash: "#!/movies/",
        onSet: function() {
            showLibrary("movies");
        },
        onRemove: function() {
            console.log("movies remove");
        }
    });
	
	$(window).hashchange({
        hash: "#!/tv/",
        onSet: function() {
            showLibrary("tv");
        },
        onRemove: function() {
            console.log("tv remove");
        }
    });
};

var displayModalDetails = function(response) {
	var details = response.result.moviedetails;
	
	$('#detailTitle').text(details.label);
	
	var plot = "<p>"+details.plot+"</p>";
	
	// Not all generes are trimmed/spaced :/
	var info = '<h5>Details</h5><table class="table table-condensed"> \
		<tr> \
			<th><span class="glyphicon glyphicon-user"></span> Director:</th> \
			<td>'+details.director+'</td> \
			<th><span class="glyphicon glyphicon-globe"></span> Country:</th> \
			<td>'+details.country+'</td> \
		</tr> \
		<tr> \
			<th><span class="glyphicon glyphicon-calendar"></span> Year:</th> \
			<td>'+details.year+'</td> \
			<th><span class="glyphicon glyphicon-tag"></span> Genre:</th> \
			<td>'+details.genre.toString().replace(/ /g, "").replace(/,/g, ", ")+'</td> \
		</tr> \
		<tr> \
			<th><span class="glyphicon glyphicon-tag"></span> Studio:</th> \
			<td>'+details.studio+'</td> \
			<th><span class="glyphicon glyphicon-link"></span> Trailer:</th> \
			<td>'+trailerEmbed(details.trailer)+'</td> \
		</tr> \
		<tr> \
			<th><span class="glyphicon glyphicon-tag"></span> Playcount:</th> \
			<td>'+details.playcount+'</td> \
			<th></th> \
			<td></td> \
		</tr> \
	</table> \
	<h5>Cast</h5>';

	var cast = $('<ul></ul>');
	$.each(details.cast, function(idx, element) {
		cast.append("<li><b>"+element.name+"</b> as "+element.role+"</li>");
	});
	
	var detailContent = $('#detailContent');
	detailContent.append(plot)
	detailContent.append(info);
	detailContent.append(cast);

	/*	var castList = $('<div class="row actors"></div>');
	$.each(details.cast, function(idx, element) {
		castList.append($('<div class="col-md-2"><div class="thumbnail"><img src="/vfs/'+encodeURIComponent(element.thumbnail)+'"><div class="caption">'+element.name+'</div></div></div>'));
	});
	itemDetails.append(castList);
	$('.actors').find('.thumbnail').uniformHeight();*/
}

function showLibrary(type) {
	console.log("Loading library: '"+type+"'");
	
	if (type == "movies") {
		var method = "VideoLibrary.GetMovies";
		var params = { "properties": ["title", "tagline", "fanart", "thumbnail", "plot", "runtime"]};
		// "TAGLINE?", "CAST", "cast", "tagline"]
	} else if (type == "tv") {
		var method = "VideoLibrary.GetTVShows";
		var params = { "properties": ["title", "tagline", "fanart", "thumbnail", "plot", "runtime"]};
	}
	
	$.jsonRPC.request(method, {
		params: params,
	 	success: function(response) {
			var results = "";
			if (type == "movies") {
				results = response.result.movies;	
			} else {
				results = response.result.tvshows;
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
				var thumb = $('<div data-toggle="modal" data-target="#detailModal" data-itemid="'+element.movieid+'" class="col-sm-3 col-md-2 media-item" title="'+element.movieid+'"></div>');
				var link = $('<a href="#" style="height: 280px" class="thumbnail"></a>');
				var image = $('<img style="height: 230px;" src="/vfs/'+encodeURIComponent(element.thumbnail)+'" alt="'+element.label+' Thumbnail">');
				var caption = $('<div class="caption"><b>'+element.label+'</b></div>');
				
				link.append(image);
				link.append(caption);
				thumb.append(link);
				lib.append(thumb);
			});
			//TODO: $(".media-item").popover({html: true, trigger: "hover"});
			
			// Load additional data when modal is opened...
			$('#detailModal').on('show.bs.modal', function(event) {
				var itemId = $(event.relatedTarget).data('itemid');
				
				$.jsonRPC.request('VideoLibrary.GetMovieDetails', {
					params: { "movieid":itemId, "properties":["plot", "director", "country", "year", "genre", "studio", "trailer", "playcount", "cast"]},
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

function trailerEmbed(pluginUrl) {
	// TODO: Are video-IDs of YT always 
	return '<a href="http://youtu.be/'+pluginUrl.substring(pluginUrl.length-11)+'" target="_blank">Watch on Youtube</1>';
}