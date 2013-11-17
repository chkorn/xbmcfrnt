(function($) {
	$.fn.uniformHeight = function() {
		var maxHeight	= 0,
			max			= Math.max;

		return this.each(function() {
			console.log($(this).height());
			maxHeight = max(maxHeight, $(this).height());
		}).height(maxHeight);
	};
})(jQuery);

var RPC = new $.JsonRpcClient({ 
	ajaxUrl: '/jsonrpc', 
	socketUrl: 'ws://'+location.hostname+':9090/jsonrpc'
});
console.log(RPC);

var VERSION = "0.0.1";

// Global stuff we don't want to query/pass-through all the time...
var PLAYER = null;
var SPEED = null;
var CURRENT_LIBRARY = null; // Remember the library type so that we don't have to pass it through everywhere for the time being
var CURRENT_ID = null;
var LAST_VOLUME_CHANGE = null;
var LAST_SEEK = null;
var MUTED = false;

Handlebars.registerHelper('inHoursMinutesSeconds', function(runtime) {
	if (runtime === 0 || runtime == "0") {
		return "--:--:--";
	}
	return moment().startOf('day').seconds(runtime).format("HH:mm:ss");
});
Handlebars.registerHelper('asTypeString', function(typeString) {
	return typeString.charAt(0).toUpperCase() + typeString.slice(1);
});
Handlebars.registerHelper('asGenreString', function(value) {
	if (value === null) {
		return "";
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
		return value.replace(/ /g, "").replace(/,/g, ", ");
	}
});
Handlebars.registerHelper('asTrailerUrl', function(value) {
	if (value === null) {
		return "No Trailer";
	} else {
		return new Handlebars.SafeString("<a href=\"http://youtu.be/"+value.substring(value.length-11)+"\" target=\"_blank\">Watch on Youtube</a>");
	}
});
Handlebars.registerHelper('asCastList', function(value) {
	if (value === null) {
		return "";
	}
	var cast = "";
	$.each(value, function(idx, element) {
		cast += "<li><b>"+element.name+"</b> as "+element.role+"</li>";
	});
	return new Handlebars.SafeString(cast);
});
Handlebars.registerHelper('playedStatus', function(value) {
	if (value === null || value === 0) {
		return "";
	} else {
		return new Handlebars.SafeString('<b title="'+value+' plays" class="glyphicon glyphicon-ok-circle"></b> ');
	}
});

$(document).ready(function() {
	// General...
	$("#controls").find(".btn").tooltip({container: 'body'});
	setActiveControls(false);
	bindControls();
	
	$.handlebars({
		templatePath: 'templates/',
		templateExtension: 'hbs'
	});
	
	// Refresh player every X seconds to make sure we display the correct values...
	setInterval(getState, 1000);
	
	// Navigation functionality to make urls sexy and bookmarkable	
	
	navigationHandler();
	$(window).bind("hashchange", navigationHandler);
	
	// Volume
	$('#volumebar').slider({min: 0, max: 100, value: 50}).on('slide', function(event) {
		if (this.value) {
			RPC.call(
				'Application.SetVolume', 
				{"volume":this.value},
				function(response) {
					LAST_VOLUME_CHANGE = new Date().getTime();
					console.log(response);
				},
				function(response) {
					console.error(response);
				}
			);
		}
	});
	$('#seekbar').slider({min: 0, max: 100, value: 50, formater: function(value) {
		return moment().startOf('day').seconds(value).format("HH:mm:ss");
	}}).on('slideStop', function(event) {
		// Note: We only really do send the seek-event when we stop dragging to avoid unpleasant behaviour (IMHO)
		if (this.value) {
			console.log(this.value);
			var time = moment.duration(this.value, "seconds");
			console.log({"playerid": 1, "value": {"hours":time.hours(), "minutes":time.minutes(), "seconds": time.seconds(), "milliseconds":0}});
			RPC.call(
				'Player.Seek', 
				{"playerid": 1, "value": {"hours":time.hours(), "minutes":time.minutes(), "seconds": time.seconds(), "milliseconds":0}}, // TODO: Make dynamic someday...
				function(response) {
					console.log(response);
				},
				function(response) {
					console.error(response);
				}
			);
		}
	});
	
	// Device capabilities for Application Menu, etc. 
	RPC.call(
		'System.GetProperties', 
		{"properties": ["canshutdown", "canhibernate", "cansuspend", "canreboot"]},
		function(response) {
			var capabilities = $('#device-capabilities');
			if (response.result.canshutdown) {
				capabilities.prepend('<li><a href="#!/shutdown/"><b class="glyphicon glyphicon-off"></b> Shutdown</a></li>');
			}
			if (response.result.canreboot) {
				capabilities.prepend('<li><a href="#!/reboot/"><b class="glyphicon glyphicon-refresh"></b> Reboot</a></li>');
			}
			if (response.result.canhibernate) {
				capabilities.prepend('<li><a href="#!/hibernate/">Hibernate</a></li>');
			}
			if (response.result.cansuspend) {
				capabilities.prepend('<li><a href="#!/suspend/">Suspend</a></li>');
			}
			// TODO: Eject...? 
		},
		function(response) {
			console.error(response);
		}
	);
	
	// Modal for Playlist..
	$('#playlistModal').on('show.bs.modal', function (event) {
		RPC.call(
			'Playlist.GetItems', 
			{"playlistid": 1, "properties":["title", "runtime", "season", "showtitle", "episode", "file"]}, // TODO: Make dynamic someday...
			function(response) {
				var playlistContent = $('#playlistContent');
				console.log(response);
				playlistContent.render('playlist', {items: response.result.items}).on('render.handlebars', function(content) {
					playlistContent.find(".play").click(function() {
						RPC.call(
							'Player.Open', 
							{ "item": { "playlistid": 1, "position": parseInt($(this).parent().data('position'))}},
							function(response) {
								console.log(response);
							}, 
							function(response) {
								console.error(response);
							}
						);
					});
					playlistContent.find(".remove").click(function() {
						RPC.call(
							'Playlist.Remove', 
							{ "playlistid": 1, "position": parseInt($(this).parent().data('position'))},
							function(response) {
								console.log(response);
							}, 
							function(response) {
								console.error(response);
							}
						);
					});
					playlistContent.find(".info").click(function() {
						console.log("NYI");
					});
				});
				console.log(response.result.items);
			},
			function(response) {
				console.error(response);
			}
		);
	});
});

var navigationHandler = function() {
	// Note: It would be much cooler to use the History API but no idea how to achieve this without the ability to RedirectMatch...
	var hash = window.location.hash;
	if (!hash || hash === "" || hash == "#!/movies/") {
		libraryRefresh();
		$('.navbar-nav').find('a[href="#!/movies/"]').parent().addClass("active");
		showLibrary("movies");
	} else if (hash == "#!/tvshows/") {
		libraryRefresh();
		$('.navbar-nav').find('a[href="#!/tvshows/"]').parent().addClass("active");
		showLibrary("tvshows");
	} else if (hash.match(/^#!\/tvshows\//)) {
		libraryRefresh();
		$('.navbar-nav').find('a[href="#!/tvshows/"]').parent().addClass("active");
		showSeriesDetails(hash.substring(11));
	} else if (hash =="#!/files/") { 
		libraryRefresh();
		$('.navbar-nav').find('a[href="#!/files/"]').parent().addClass("active");
		showLibrary("files");
	} else if (hash.match(/^#!\/files\//)) {
		libraryRefresh();
		$('.navbar-nav').find('a[href="#!/files/"]').parent().addClass("active");
		browseDirectory(hash.substring(9));
	} else if (hash =="#!/shutdown/") {
		RPC.call(
			'System.Shutdown', 
			function(response) {
				console.log(response);
			}, 
			function(response) {
				console.error(response);
			}
		);
	} else if (hash =="#!/restart/") {
		RPC.call('System.Restart', 
			function(response) {
				console.log(response);
			}, 
			function(response) {
				console.error(response);
			}
		);
	} else if (hash =="#!/hibernate/") {
		RPC.call('System.Hibernate', 
			function(response) {
				console.log(response);
			}, 
			function(response) {
				console.error(response);
			}
		);
	} else if (hash =="#!/suspend/") {
		RPC.call('System.Suspend', 
			function(response) {
				console.log(response);
			}, 
			function(response) {
				console.error(response);
			}
		);
	} else if (hash == "#!/settings/") {
		libraryRefresh();
		$('#library').render('settings', {VERSION: VERSION}).on('render.handlebars', function() {
			$('#loading').hide();
		});
	}
};

var showSeriesDetails = function (seriesId) {
	console.log("Loading " + seriesId);
	RPC.call(
		'VideoLibrary.GetSeasons', 
		{ "tvshowid": parseInt(seriesId), "properties": ["showtitle", "season", "fanart", "thumbnail"]},
		function (response) {
			var seasons = response.result.seasons;
			var library = $('#library');
			library.html("<h1>" + seasons[0].showtitle + "</h1>");
			var nav = $('<ul class="nav nav-tabs" id="seasonTabs"></ul>');
			library.append(nav);

			var seasonList = $("<div class='tab-content'></div>");
			library.append(seasonList);

			$.each(seasons, function (idx, element) {
				nav.append($('<li' + (element.season == 1 ? ' class="active" ' : '') + ' ><a data-toggle="tab" href="#season-' + element.season + '">Season ' + element.season + '</a></li>'));
				RPC.call(
					'VideoLibrary.GetEpisodes', 
					{ "tvshowid": parseInt(seriesId), "season": element.season, "properties": ["showtitle", "episode", "runtime", "title", "fanart", "thumbnail", "playcount"]},
					function (response) {
						var episodes = response.result.episodes;
						var tab = $('<div class="tab-pane' + (element.season == 1 ? ' active' : '') + '" id="season-' + element.season + '"></div>');
						tab.render('tvshow-episodes', {episodes: episodes});
						seasonList.append(tab);
						tab.find('.add-to-playlist').click(function() {
							console.log({"item":{"episodeid": $(this).parent().data('id')}});
							RPC.call(
								'Playlist.Add', 
								{ "playlistid": 1, "item": { "episodeid": parseInt($(this).parent().data('id')) }},
								function(response) {
									console.log(response);
								}, 
								function(response) {
									console.error(response);
								}
							);
						});
						tab.find(".play").click(function() {
							console.log({"item":{"episodeid": $(this).parent().data('id')}});
							RPC.call(
								'Player.Open', 
								{ "item": { "episodeid": parseInt($(this).parent().data('id')) }},
								function(response) {
									console.log(response);
								}, 
								function(response) {
									console.error(response);
								}
							);
						});
						tab.tab(); // TODO: Needed?
						$('#loading').hide();
					},
					function (response) {
						console.error(response);
					}
				);
			});
			$('#loading').hide();
		},
		function (response) {
			console.error(response);
		}
	);
};

var libraryRefresh = function() {
	$('#library').html("");
	$('#loading').show();
	$('.navbar-nav').children('.active').removeClass("active");
};

var displayModalDetails = function(response) {
	var details, itemId = null;
	if (CURRENT_LIBRARY == "movies") {
		details = response.result.moviedetails; 
		itemId = "movieid";
	} else if (CURRENT_LIBRARY == "tvshows") {
		details = response.result.tvshowdetails;
		itemId = "tvshowid";
	} else {
		console.error(CURRENT_LIBRARY + " is not yet implemented!");
	}
	
	$('#detailTitle').text(details.title);
	$("#detailContent").render(CURRENT_LIBRARY+"-details", {details: details});

	/*	var castList = $('<div class="row actors"></div>');
	$.each(details.cast, function(idx, element) {
		castList.append($('<div class="col-md-2"><div class="thumbnail"><img src="/vfs/'+encodeURIComponent(element.thumbnail)+'"><div class="caption">'+element.name+'</div></div></div>'));
	});
	itemDetails.append(castList);
	$('.actors').find('.thumbnail').uniformHeight();*/
};

var showLibrary = function(type) {
	console.log("Loading library: '"+type+"'");
	libraryRefresh();
	CURRENT_LIBRARY = type;
	
	if (CURRENT_LIBRARY == "movies") {
		showMovieLibrary();
	} else if (CURRENT_LIBRARY == "tvshows") {
		showTVShowsLibrary();
	} else if (CURRENT_LIBRARY == "files") {
		browseDirectory();
	}
};

var browseDirectory = function(path) {
	var method, params;
	if (!path) {
		method = "Files.GetSources";
		params = {"media": "video"};
	} else {
		method = "Files.GetDirectory";
		params = {"directory": path, "media":"video"};
	}
	
	RPC.call(
		method, 
		params,
		function (response) {
			console.log(response);
			$('#loading').hide();
			
			var results = null;
			if (!path) {
				results = response.result.sources;
			} else {
				results = response.result.files;
			}
			if (results.length === 0) {
				$('#library').text("No content yet!");
				return;
			}
			var lib = $('#library');
			lib.html("<h1>Browse</h1>");

			var rows = $('<div class="row"/>');
			lib.append(rows);

			$.each(results, function (idx, element) {
				var thumb = $('<div class="col-sm-3 col-md-2 media-item" title="' + element.label + '"></div>');
				var link = $('<a href="#!/files/'+element.file+'/" class="thumbnail directory-item"></a>');
				var image = $('<img src="img/folder.png" alt="' + element.label + 'Folder">');
				var caption = $('<div class="caption"><b>' + element.label + '</b></div>');

				link.append(image);
				link.append(caption);
				thumb.append(link);
				lib.append(thumb);
			});
		},
		function (response) {
			console.error(response);
		}
	);
};

var showMovieLibrary = function() {
	var method = "VideoLibrary.GetMovies";
	var params = { "properties": ["title", "tagline", "fanart", "thumbnail", "plot", "runtime"]};

	RPC.call(
		method, 
		params,
		function (response) {
			$('#loading').hide();

			var results, itemId, name;
			if (CURRENT_LIBRARY == "movies") {
				results = response.result.movies;
				itemId = "movieid";
				name = "Movies";
			} else if (CURRENT_LIBRARY == "tvshows") {
				results = response.result.tvshows;
				itemId = "tvshowid";
				name = "TV Shows";
			} else {
				console.error(CURRENT_LIBRARY + " is not yet implemented!");
			}
			if (results.length === 0) {
				$('#library').text("No content yet!");
				return;
			}
			var lib = $('#library');
			lib.html("<h1>Your " + name + " (" + results.length + ")</h1>");

			var rows = $('<div class="row"/>');
			lib.append(rows);

			$.each(results, function (idx, element) {
				var thumb = $('<div data-toggle="modal" data-target="#detailModal" data-itemtype="' + CURRENT_LIBRARY + '" data-itemid="' + element[itemId] + '" class="col-sm-3 col-md-2 media-item" title="' + element.title + '"></div>');
				var link = $('<a href="#" style="height: 280px" class="thumbnail"></a>');
				var image = $('<img style="height: 230px;" data-src="/vfs/'+encodeURIComponent(element.thumbnail)+'" src="img/missing.png" alt="' + element.title + ' Thumbnail">');
				var caption = $('<div class="caption"><b>' + element.title + '</b></div>');

				link.append(image);
				link.append(caption);
				thumb.append(link);
				lib.append(thumb);
			});
			$("img").unveil();
			//TODO: $(".media-item").popover({html: true, trigger: "hover"});

			// Load additional data when modal is opened...
			$('#detailModal').on('show.bs.modal', function (event) {
				var method;
				var params;
				var button = $(event.relatedTarget);
				var itemId = button.data('itemid');

				if (CURRENT_LIBRARY == "movies") {
					method = "VideoLibrary.GetMovieDetails";
					params = { "movieid": itemId, "properties": ["title", "plot", "year", "genre", "country", "director", "studio", "trailer", "playcount", "cast"]};
				} else if (CURRENT_LIBRARY == "tvshows") {
					method = "VideoLibrary.GetTVShowDetails";
					params = { "tvshowid": itemId, "properties": ["title", "plot", "year", "genre", "studio", "playcount", "cast"]};
				} else {
					console.error(CURRENT_LIBRARY + " is not yet implemented!");
				}
				RPC.call(
					method, 
					params,
					displayModalDetails,
					function (response) {
						console.error(response);
					}
				);
			});
		},
		function (response) {
			console.error(response);
		}
	);
};

var showTVShowsLibrary = function() {
	RPC.call(
		"VideoLibrary.GetTVShows", 
		{ "properties": ["title", "fanart", "thumbnail", "plot", "playcount"]},
		function(response) {
			$('#loading').hide();
			var results = response.result.tvshows;
			var itemId = "tvshowid";
			var name = "TV Shows";

			if (results.length === 0) {
				$('#library').text("No content yet!");
				return;
			} 
			
			var lib = $('#library');
			lib.html("<h1>Your TV Shows ("+results.length+")</h1>");
			
			var rows = $('<div class="row"/>');
			lib.append(rows);
			
			$.each(results, function(idx, element) {
				var thumb = $('<div class="col-sm-3 col-md-2 media-item" title="'+element.title+'"></div>');
				var link = $('<a href="#!/tvshows/'+element.tvshowid+'" style="height: 280px" class="thumbnail"></a>');
				var image = $('<img style="height: 230px;" src="missing.png" data-src="/vfs/'+encodeURIComponent(element.thumbnail)+'" alt="'+element.title+' Thumbnail">');
				var caption = $('<div class="caption"><b>'+element.title+'</b></div>');
				
				link.append(image);
				link.append(caption);
				thumb.append(link);
				lib.append(thumb);
			});
			$("img").unveil();
			//TODO: $(".media-item").popover({html: true, trigger: "hover"});
		},
		function(response) {
			console.error(response);
		}
	); 
};

function getPlayingInfo(mediaType) {
	// Get details
	var infoParams;
	if (mediaType == "audio") {
		infoParams = { "properties": ["title", "album", "artist", "duration", "thumbnail", "file", "fanart", "streamdetails"], "playerid": PLAYER };
	} else if (mediaType == "video") {
		infoParams = { "properties": ["title", "album", "artist", "season", "episode", "duration", "showtitle", "tvshowid", "thumbnail", "file", "fanart", "streamdetails"], "playerid": PLAYER };
	} else {
		console.log("NYI/TODO");
		return;
	}
	
	// Update based on value...
	RPC.call(
		'Player.GetItem', 
		infoParams,
		function(response) {
			var item = response.result.item;
			
			if (item === null) {
				$('#nowplaying').html("Nothing playing");
			}
			
			if (item.id != CURRENT_ID) {
				CURRENT_ID = item.id;
			}
			
			// Update text...
			// TODO: Checkme?!
			if (item.showtitle) {
				$('#nowplaying').html('<b>' + item.showtitle + " - " + item.label+'</b>');
			} else if (item.title) {
				$('#nowplaying').html('<b>' + item.title + '</b>');
			} else if (item.label) {
				$('#nowplaying').html('<b>' + item.label + '</b>');
			} else {
				console.error(item);
			}
			
			// Update Seekbar...
			updateSeekBar();
		},
		function(response) {
			console.error(response);
		}
	); 
	
	// Get playlist info...
	var playlistParams;
	if (mediaType == "audio") {
		playlistParams = { "properties": ["title", "album", "artist", "duration"], "playlistid": 0 };
	} else if (mediaType == "video") {
		playlistParams = { "properties": [ "runtime", "showtitle", "season", "title", "artist" ], "playlistid": 1};
	} else {
		console.log("NYI/TODO");
		return;
	}
	
	// TODO: Controls ANPASSEN
	RPC.call(
		'Playlist.GetItems', 
		playlistParams,
		function(response) {
			//console.log(response)
		},
		function(response) {
			console.error(response);
		}
	); 
}

function getState() {
	// Get the active players, then get the item details if needed
	RPC.call(
		'Player.GetActivePlayers', 
		[],
		function(response) {
			if (response.result.length > 0) {
				var result = response.result[0];
				
				PLAYER = result.playerid;
				getPlayingInfo(result.type);
			} else {
				if (PLAYER !== null) {
					PLAYER = null;					
					setActiveControls(false);
					updateSeekBar();
				}
			}
		},
		function(response) {
			console.log(response);
		}
	);
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
	if (newSpeed == 1 && (SPEED === 0 || SPEED === null)) {
		// Was paused, now playing
		setIsPlaying(false);
	} else if (newSpeed == 1 && SPEED > 1) {
		// Was running at higher speed, now playing
		setIsForwarding(false);
	} else if (newSpeed == 1 && SPEED < 1) {
		// Was running backward, now playing
		setIsReversing(false);
	} else if (newSpeed === 0 && SPEED > 1) {
		// Was running at higher speed, now paused
	} else if (newSpeed === 0 && SPEED < 1) {
		// Was running backward, now paused
	} else if (newSpeed === 0 && (SPEED === 1 || SPEED === null)) {
		// Was playing, now paused
		setIsPlaying(true);
	} else if (newSpeed > 1) {
		setIsForwarding(true);
	} else if (newSpeed < 1) {
		setIsReversing(true);
	}
	SPEED = newSpeed;
}

function updateSeekBar() {
	if (PLAYER) {
		RPC.batch(
			batch.call(
				function(batch) {
					batch.call('Player.GetProperties', { "properties": ["percentage", "time", "totaltime", "speed", "position", "playlistid"], "playerid": PLAYER});
					batch.call('Application.GetProperties', {"properties": ["volume", "muted"]});
				},
				function(response) {
					var player = response[0].result;
					var application = response[1].result;
					
					if (MUTED != application.muted) {
						var icon = $('#control-mute').children("span.glyphicon").first();
						if (MUTED) {
							icon.addClass("glyphicon-volume-off").removeClass("glyphicon-volume-up");
						} else {
							icon.addClass("glyphicon-volume-up").removeClass("glyphicon-volume-off");
						}
					}
					MUTED = application.muted;
					
					// Update Seekbar
					// TODO: (for volume and seek) -> Lock jumping if currently seeking/adjusting
					if (!LAST_SEEK || new Date().getTime() > LAST_SEEK + 2000) {
						$('#seekbar').slider("setMaxValue", Math.ceil(moment.duration(player.totaltime).asSeconds()));
						$('#seekbar').slider("setValue", Math.ceil(moment.duration(player.time).asSeconds()));
					}
					
					// Update volume. But only after a few seconds have passed when the time was changed via this interface. 
					// This avoids a "jumping" slider
					if (!LAST_VOLUME_CHANGE || new Date().getTime() > LAST_VOLUME_CHANGE + (2000)) {
						$("#volumebar").slider("setValue", application.volume);
					}
					speedUpdate(player.speed);
					// Set current time...
					$('#time').text(formatTime(player.time));
					$('#totaltime').text(formatTime(player.totaltime));
				},
				function(result) {
					console.error(result);
				}
			)
		);
	} else {
		// Resetting...
		var seekbar = $('#seekbar');
		seekbar.attr("aria-valuenow", 0);
		seekbar.css("width", "0%");
	
		// Set current time...
		$('#time').text("00:00:00");
	
		// We don't need to update this every seconds.. Move it somewhere else later! TODO
		$('#totaltime').html("&infin;");
	}
}

function setActiveControls(controlState) {
	if (controlState) {
		$("#controls").find('.btn').each(function(idx, element) {
			$(element).removeClass("disabled");
		});
	} else {
		$("#controls").find(".btn").each(function(idx, element) {
			$(element).addClass("disabled");
		});
	}
}

function bindControls() {
	$('#control-playpause').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Player.PlayPause', 
				{ "playerid": PLAYER },
				function(response) {
					speedUpdate(response.result.speed);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-stop').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Player.Stop', 
				{ "playerid": PLAYER },
				function(response) {
					speedUpdate(response.result.speed);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-back').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Back', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-up').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Up', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-down').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Down', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-left').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Left', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-right').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Right', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-select').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Select', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-home').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.Home', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-info').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Input.ShowOSD', 
				function(response) {
					console.log(response);
				},
				function(response) {
				
				}
			);
		}
	});
	$('#control-mute').click(function() {
		if(!$(this).hasClass("disabled")) {
			RPC.call(
				'Application.SetMute', 
				{"mute":!MUTED},
				function(response) {
					console.log(response);
				},
				function(response) {
					console.error(response);
				}
			);
		}
	});
}

function formatTime(parts) {
	return moment(parts).format("HH:mm:ss");
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
