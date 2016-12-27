/**
 * "gulp"						- main watch js a css files
 * "gulp watch-ftp"				- same as "gulp" but which deploing to remote server
 * "gulp pack-js"				- concat js files in "/js/plugins" and "/js/vendor" dirs
 * "gulp pack-css"				- concat css files in "/css/plugins" and "/css/vendor" dirs
 * 
 * "gulp download_full"			- download full project from remote server
 * "gulp download_wp_content"	- download full wp-content directory from remote server
 * "gulp download_themes"		- download full wp-content/themes directory from remote server
 * "gulp download_plugins"		- download full wp-content/plugins directory from remote server
 * 
 * "gulp upload_full"			- upload full project to remote server
 * "gulp upload_wp_content"		- upload full wp-content directory to remote server
 * "gulp upload_themes"			- upload full wp-content/themes directory to remote server
 * "gulp upload_plugins"		- upload full wp-content/plugins directory to remote server
 * 
 * "gulp webui"					- start web ui for git
 */
 
 
var gulp			= require('gulp');
var less			= require('gulp-less');
var rename			= require("gulp-rename");
var cleancss		= require('gulp-clean-css');
var uglify			= require('gulp-uglify');
var combiner		= require('stream-combiner2');
var watch			= require('gulp-watch');
var gutil			= require('gulp-util');
var prettyHrtime	= require('pretty-hrtime');
var node_path		= require('path');
var concat			= require('gulp-concat');


var path = './wp-content/themes/name/'; // etc. ./wp-content/themes/name/ OR ./

var ftp = {
	dev: {
		host: "",			// example.com
		login: "",
		pass: "",
		path: "",			// /www
		protocol: "ftp",	// ftp OR sftp
		port: "21"			// ssh 2121
	},
	production: {
		host: "",			// example.com
		login: "",
		pass: "",
		path: "/www",		// /www
		protocol: "ftp",	// ftp OR sftp
		port: "21"			// ssh 2121
	}
};

var connect_to = ftp.dev;	// OR ftp.production

gulp.task('default', function() {
	watch_js_css();
});

gulp.task('watch-ftp', function() {
	watch_js_css();

	return watch([path + '**', path + '!node_modules{,/**}', path + '!package.json', path + '!gulpfile.js', path + '!.git{,/**}'], function(datos) {
		for (var i = 0; i < datos.history.length; i++) {
			(function(i) {
				if (datos.history[i].search('.git') > 0) {
					return;
				}
				var archivoLocal = datos.history[i];
				var archivoRel = datos.history[i].replace(datos.cwd, '');
				
				var archivoRemoto = connect_to.path + archivoRel;
				var valid = true;
				if (archivoLocal.indexOf('/.') >= 0) {
					valid = false; //ignore .git, .ssh folders and the like
				}

				var disable_ssl = "set ftp:ssl-allow no; ";
				var opt = "set net:max-retries 2;set net:reconnect-interval-base 1;set net:reconnect-interval-multiplier 1; ";
				if (connect_to.protocol == "sftp") {
					disable_ssl = "";
				}

				var comando = disable_ssl + opt + "open -u " + connect_to.login + "," + connect_to.pass + " " + connect_to.protocol + "://" + connect_to.host + " -p " + connect_to.port + "; put " + archivoLocal + " -o " + archivoRemoto;
				if (valid) {

					var exec = require('child_process').exec;
					var child = exec('lftp -c "' + comando + '"');

					// Listen for any response:
					child.stdout.on('data', function(data) {
						console.log(child.pid, data);
					});

					// Listen for any errors:
					child.stderr.on('data', function(data) {
						console.log(child.pid, data);
					});

					// Listen if the process closed
					child.on('close', function(exit_code) {
						if (exit_code == 0) {
							console.log("\x1b[42mUpload complete\x1b[0m - " + archivoLocal);
						}
						else {
							console.log("\x1b[41mError\x1b[0m");
						}
					});
				}
			})(i);
		} //end for
	}); //end watch
});

gulp.task('pack-js', function() {
	return pack_js(true);
});

gulp.task('pack-css', function() {
	return pack_css(true);
});

function watch_js_css() {
	watch([path + 'css/**/*'], function(datos) {
		for (var i = 0; i < datos.history.length; i++) {
			(function(i) {
				var parse = node_path.parse(datos.history[i]);
				
				if (parse.dir.search('/css/vendor') > 0 || parse.dir.search('/css/plugins') > 0) {
					pack_css();
				} else if (parse.ext == '.less') {
					less_function(datos.history[i]);
				}
			})(i);
		}
	});

	watch([path + 'js/**/*'], function(datos) {
		for (var i = 0; i < datos.history.length; i++) {
			(function(i) {
				var parse = node_path.parse(datos.history[i]);
				
				if (parse.dir.search('/js/vendor') > 0 || parse.dir.search('/js/plugins') > 0) {
					pack_js();
				} else if (parse.ext == '.js' && parse.name.search('.min') <= 0) {
					compressjs_function(datos.history[i]);
				}
			})(i);
		}
	});
}

function less_function(files) {
	var f = node_path.parse(files);

	if (f.ext != '.less') {
		return;
	}

	var start = process.hrtime();
	gutil.log('Starting \'\x1b[36mless\x1b[0m\' - ' + get_file_path(files));

	var combined = combiner.obj([
		gulp.src(files),
		less(),
		gulp.dest(path + 'css'),
		cleancss({
			'keepSpecialComments': 0
		}),
		rename({
			suffix: '.min',
		}),
		gulp.dest(path + 'css')
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));

	combined.on('finish', log('Finished \'\x1b[36mless\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m - ' + get_file_path(files)));
	return combined;
};

function compressjs_function(files) {
	var f = node_path.parse(files);

	if (f.ext != '.js') {
		return;
	}

	var start = process.hrtime();
	gutil.log('Starting \'\x1b[36mcompressjs\x1b[0m\' - ' + get_file_path(files));

	var combined = combiner.obj([
		gulp.src(files),
		uglify(),
		rename({
			suffix: '.min'
		}),
		gulp.dest(path + 'js')
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));
	combined.on('finish', log('Finished \'\x1b[36mcompressjs\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m - ' + get_file_path(files)));
	return combined;
};

function pack_css(hide_output) {

	hide_output = hide_output || false;

	if (!hide_output) {
		var start = process.hrtime();
		gutil.log('Starting \'\x1b[36mpack-css\x1b[0m\'');
	}

	var combined = combiner.obj([
		gulp.src([path + 'css/vendor/**/*.css', path + 'css/plugins/**/*.css']),
		concat('plugins.css'),
		gulp.dest(path + 'css'),
		cleancss({
			'keepSpecialComments': 0
		}),
		rename({
			suffix: '.min'
		}),
		gulp.dest(path + 'css')
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));

	if (!hide_output) {
		combined.on('finish', log('Finished \'\x1b[36mpack-css\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m'));
	}

	return combined;
};

function pack_js(hide_output) {
	hide_output = hide_output || false;

	if (!hide_output) {
		var start = process.hrtime();
		gutil.log('Starting \'\x1b[36mpack-js\x1b[0m\'');
	}

	var combined = combiner.obj([
		gulp.src([path + 'js/vendor/**/*.js', path + 'js/plugins/**/*.js']),
		concat('plugins.js'),
		gulp.dest(path + 'js'),
		uglify(),
		rename({
			suffix: '.min'
		}),
		gulp.dest(path + 'js')
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));

	if (!hide_output) {
		combined.on('finish', log('Finished \'\x1b[36mpack-js\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m'));
	}

	return combined;
};

gulp.task('download_full', function() {
	download("");
});

gulp.task('download_wp_content', function() {
	download("/wp-content");
});

gulp.task('download_themes', function() {
	download("/wp-content/themes");
});

gulp.task('download_uploads', function() {
	download("/wp-content/uploads");
});

gulp.task('download_plugins', function() {
	download("/wp-content/plugins");
});

gulp.task('upload_full', function() {
	upload("");
});

gulp.task('upload_wp_content', function() {
	upload("/wp-content");
});

gulp.task('upload_themes', function() {
	upload("/wp-content/themes");
});

gulp.task('upload_uploads', function() {
	upload("/wp-content/uploads");
});

gulp.task('upload_plugins', function() {
	upload("/wp-content/plugins");
});

function log(message) {
	return function() {
		gutil.log(message + "\n");
	}
}

function get_file_path(file) {
	return file.replace('/home/ubuntu/workspace/' + path.replace('./', ''), '');
}

function download(path) {
	var start = process.hrtime();
	var disable_ssl = "set ftp:ssl-allow no; ";
	
	if (connect_to.protocol == "sftp") {
		disable_ssl = "";
	}
	var comando = disable_ssl + "open -u " + connect_to.login + "," + connect_to.pass + " " + connect_to.protocol + "://" + connect_to.host + " -p " + connect_to.port + "; mirror --parallel=10 --exclude \"(header-external-scripts.php|.git|.gitignore|.htaccess|wp-config.php|.c9|node_modules|gulpfile.js|package.json|start.sh)+\" " + connect_to.path + path + "/ /home/ubuntu/workspace" + path;

	const spawn = require('child_process').spawn;
	const command = spawn('lftp', ['-c', comando], {
		stdio: ['inherit', 'inherit', 'inherit']
	});

	command.on('close', (code) => {
		if (code == 0) {
			console.log("\x1b[42mDownload complete\x1b[0m after \x1b[35m" + prettyHrtime(process.hrtime(start)) + "\x1b[0m");
		}
		else {
			console.log("\x1b[41mError\x1b[0m");
		}
	});
}

function upload(path) {
	var start = process.hrtime();
	var disable_ssl = "set ftp:ssl-allow no; ";
	
	if (connect_to.protocol == "sftp") {
		disable_ssl = "";
	}
	var comando = disable_ssl + "open -u " + connect_to.login + "," + connect_to.pass + " " + connect_to.protocol + "://" + connect_to.host + " -p " + connect_to.port + "; mirror --parallel=10 -R --exclude \"(header-external-scripts.php|.git|.gitignore|.htaccess|wp-config.php|.c9|node_modules|gulpfile.js|package.json|start.sh)+\" /home/ubuntu/workspace" + path + "/ " + connect_to.path + path;

	const spawn = require('child_process').spawn;
	const command = spawn('lftp', ['-c', comando], {
		stdio: ['inherit', 'inherit', 'inherit']
	});

	command.on('close', (code) => {
		if (code == 0) {
			console.log("\x1b[42mUpload complete\x1b[0m after \x1b[35m" + prettyHrtime(process.hrtime(start)) + "\x1b[0m");
		}
		else {
			console.log("\x1b[41mError\x1b[0m");
		}
	});
}

gulp.task('webui', function() {

	const spawn = require('child_process').spawn;
	try {
		process.chdir(path);
		console.log(`New directory: ${process.cwd()}`);
		const grep = spawn('git', ['webui', '--allow-hosts=' + process.env.C9_HOSTNAME, '--port=8082', '--no-browser'], {
			stdio: ['inherit', 'inherit', 'inherit']
		});
	}
	catch (err) {
		console.log(`\x1b[41mError chdir: ${err}\x1b[0m`);
	}
	
});
