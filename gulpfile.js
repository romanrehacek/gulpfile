/**
 * @author			Roman Rehacek
 * @url				https://github.com/romanrehacek/gulpfile
 * @date			29.12.2016
 * @description		Type "gulp" into command line to show tasks menu
 * 
 *					Install gulp for the first time
 *					npm init
 *					npm install gulp -g
 *					npm install --save-dev gulp
 *					npm install --save-dev gulp-less gulp-rename gulp-clean-css gulp-uglify stream-combiner2 gulp-watch gulp-util pretty-hrtime gulp-concat inquirer find-in-files gulp-sass
 *
 */


var default_path = '[enter_path]';	// ex. ./wp-content/themes/name/ OR ./

var ftp = {
		dev: {
			host:		"",			// example.com
			login:		"",
			pass:		"",
			path:		"",			// /www
			protocol:	"ftp",		// ftp OR sftp
			port:		"21"		// ssh 2121
		},
		production: {
			host:		"",			// example.com
			login:		"",
			pass:		"",
			path:		"",			// /www
			protocol:	"ftp",		// ftp OR sftp
			port:		"21",		// ssh 2121
			ssh_key:	""			// private ssh key
		}
	};

var connect_to = ftp.dev;			// ftp.dev OR ftp.production

/***************************
 * ***** STOP EDITING! *****
 * *************************/
 
connect_to.path = untrailingSlashIt(connect_to.path);
 
var selected		= {task : '', path : ''};
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
var inquirer		= require('inquirer');
var fs				= require('fs');
var findInFiles 	= require('find-in-files');
var sass 			= require('gulp-sass');

// default gulp task
gulp.task('default', function(done){
	var question = [{
		type : 'list',
		name : 'task',
		message : 'Select task',
		choices: [
				{ name: 'Watch less/js',				value: 'watch' },
				{ name: 'Watch less/js and deploy', 	value: 'watch_ftp' },
				{ name: 'Upload to remote server',		value: 'upload' },
				{ name: 'Download from remote server',	value: 'download' },
				{ name: 'Start git webui',				value: 'webui' },
				{ name: 'Exit', 						value: 'exit' },
			],
		default: 'watch'
	}];
	
	inquirer.prompt(question).then(function(answer) {
		done();
		selected.task = answer.task.toString().trim();
		
		switch (selected.task) {
			case 'exit':
				process.exit(2);
				break;
			case 'watch':
			case 'webui':
				get_paths();
				break;
			case 'watch_ftp':
			case 'upload':
			case 'download':
				get_paths(true);
				break;
		}
		
		/**
		 * If is necessary to call function
		 * eg. global.watch = function watch() { get_paths(); }
		 * 
		 * if (selected.task in global && typeof global[selected.task] === "function") {
		 *		global[selected.task]();
		 * }
		 */
		
		//process.exit(2);
	});
});

function get_paths(more) {
	var is_wp = false;
	var paths = [];
	
	// check, if wp-content directory exists (is wordpress site)
	if (fs.existsSync(get_full_path('wp-content'))){
    	[
    		'./wp-content/themes/',
    		'./wp-content/plugins/'
    	]
    	.forEach(function(subdir){
    		// get subdirs of themes a plugins dirs
    	 	paths = paths.concat(walk(subdir));
    	});
    	is_wp = true;
	} else {
		// use only root dir
		selected.path = get_full_path('./');
		
		// skip directory chosing
		start_task();
		return;
	}
	
	var choices = [];
	
	// prepare choices
	paths.forEach(function(path_name) {
		choices = choices.concat( { name: get_rel_path(path_name), value: path_name } );
	});
	
	if (more === true && is_wp) {
		choices = choices.concat(new inquirer.Separator());
		choices = choices.concat( { name: 'Full site', value: get_full_path('./') } );
		choices = choices.concat( { name: 'All plugins', value: get_full_path('./wp-content/plugins/') } );
		choices = choices.concat( { name: 'Uploads', value: get_full_path('./wp-content/uploads/') } );
		choices = choices.concat( { name: 'Full wp-content', value: get_full_path('./wp-content/') } );
	}
	
	choices = choices.concat(new inquirer.Separator());
	choices = choices.concat( { name: 'Exit', value: 'exit' } );
	
	var question = [{
		type : 'list',
		name : 'path',
		message : 'Select path',
		choices: choices,
		default: get_full_path(default_path)
	}];
	
	return inquirer.prompt(question).then(function(answer) {
		selected.path = answer.path.toString().trim();
		
		if (selected.path === 'exit') {
			process.exit(2);
		} 
		
		// call functions
		start_task();
	});
}

function start_task() {
	switch (selected.task) {
		case 'watch':
			watch_js_css();
			break;
		case 'watch_ftp':
			watch_js_css();
			start_watch_ftp();
			break;
		case 'upload':
			upload();
			break;
		case 'download':
			download();
			break;
		case 'webui':
			start_webui();
			break;
	}
}

function start_watch_ftp() {

	return watch([
					selected.path + '/**', 
					selected.path + '/!node_modules{,/**}', 
					selected.path + '/!package.json', 
					selected.path + '/!gulpfile.js', 
					selected.path + '/!.git{,/**}'
				], function(datos) {
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
								var opt = "set net:max-retries 3;set net:reconnect-interval-base 1;set net:reconnect-interval-multiplier 1; ";
								if (connect_to.protocol == "sftp") {
									disable_ssl = "";
								}
								
								var port = '';
								if (connect_to.port) {
									port = " -p " + connect_to.port;
								}
				
								var comando = disable_ssl + opt + "open -u " + connect_to.login + "," + connect_to.pass + " " + connect_to.protocol + "://" + connect_to.host + " " + port + "; put " + archivoLocal + " -o " + archivoRemoto;
								
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
}

function watch_js_css() {
	var assetsDir = '';
	if (fsExistsSync(selected.path + '/assets')) {
		assetsDir = '/assets';
	}
	
	watch([selected.path + '/**/css/**/*', '!' + selected.path + '/.c9/**/css/**/*'], function(datos) {
		for (var i = 0; i < datos.history.length; i++) {
			(function(i) {
				var parse = node_path.parse(datos.history[i]);
				
				if (parse.dir.search('/css/vendor') > 0 || parse.dir.search('/css/plugins') > 0) {
					pack_css();
				
				} else if (parse.ext == '.scss' && parse.name.charAt(0) != '_') {
					sass_function( selected.path + assetsDir + '/css/style.scss' );
					
				// compile .less files, not _.less
				} else if (parse.ext == '.less' && parse.name.charAt(0) != '_') {
					less_function(datos.history[i]);
				
				// if save _.less file, find import of this file in other .less files and compile them
				} else if (parse.ext == '.less' && parse.name.charAt(0) == '_') {
					var f = node_path.parse(datos.history[i]);
					
					findInFiles.find("@import\\s+[\"']" + f.name + "(" + f.ext + ")?[\"'];", f.dir, '.less$')
				    .then(function(results) {
				        for (var result in results) {
				            less_function(result);
				        }
				    });
				}
			})(i);
		}
	});

	watch([selected.path + '/**/js/**/*', '!' + selected.path + '/.c9/**/js/**/*'], function(datos) {
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
	gutil.log('Starting \'\x1b[36mless\x1b[0m\' - ' + get_rel_path(files));

	var combined = combiner.obj([
		gulp.src(files),
		less(),
		gulp.dest(f.dir),
		cleancss({
			'keepSpecialComments': 0
		}),
		rename({
			suffix: '.min',
		}),
		gulp.dest(f.dir)
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));

	combined.on('finish', log('Finished \'\x1b[36mless\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m - ' + get_rel_path(files)));
	return combined;
}

function sass_function(files) {
	var f = node_path.parse(files);

	if (f.ext != '.scss') {
		return;
	}

	var start = process.hrtime();
	gutil.log('Starting \'\x1b[36msass\x1b[0m\' - ' + get_rel_path(files));

	var combined = combiner.obj([
		gulp.src(files),
		sass().on('error', sass.logError),
		gulp.dest(f.dir),
		cleancss({
			'keepSpecialComments': 0
		}),
		rename({
			suffix: '.min',
		}),
		gulp.dest(f.dir)
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));

	combined.on('finish', log('Finished \'\x1b[36msass\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m - ' + get_rel_path(files)));
	return combined;
}

function compressjs_function(files) {
	var f = node_path.parse(files);

	if (f.ext != '.js') {
		return;
	}

	var start = process.hrtime();
	gutil.log('Starting \'\x1b[36mcompressjs\x1b[0m\' - ' + get_rel_path(files));

	var combined = combiner.obj([
		gulp.src(files),
		uglify(),
		rename({
			suffix: '.min'
		}),
		gulp.dest(f.dir)
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));
	combined.on('finish', log('Finished \'\x1b[36mcompressjs\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m - ' + get_rel_path(files)));
	return combined;
}

function pack_css(hide_output) {

	hide_output = hide_output || false;

	if (!hide_output) {
		var start = process.hrtime();
		gutil.log('Starting \'\x1b[36mpack-css\x1b[0m\'');
	}
	
	var assetsDir = '';
	if ( fsExistsSync( selected.path + '/assets' ) ) {
		assetsDir = '/assets';
	}

	var combined = combiner.obj([
		gulp.src([selected.path + '/**/css/vendor/**/*.css', selected.path + '/**/css/plugins/**/*.css']),
		concat('plugins.css'),
		gulp.dest(selected.path + assetsDir + '/css'),
		cleancss({
			'keepSpecialComments': 0
		}),
		rename({
			suffix: '.min'
		}),
		gulp.dest(selected.path + assetsDir + '/css')
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
	
	var assetsDir = '';
	if ( fsExistsSync( selected.path + '/assets' ) ) {
		assetsDir = '/assets';
	}

	var combined = combiner.obj([
		gulp.src([selected.path + '/**/js/vendor/**/*.js', selected.path + '/**/js/plugins/**/*.js']),
		concat('plugins.js'),
		gulp.dest(selected.path + assetsDir + '/js'),
		uglify(),
		rename({
			suffix: '.min'
		}),
		gulp.dest(selected.path + assetsDir + '/js')
	]);

	// any errors in the above streams will get caught
	// by this listener, instead of being thrown:
	combined.on('error', console.error.bind(console));

	if (!hide_output) {
		combined.on('finish', log('Finished \'\x1b[36mpack-js\x1b[0m\' after \x1b[35m' + prettyHrtime(process.hrtime(start)) + '\x1b[0m'));
	}

	return combined;
};

function download() {
	var start = process.hrtime();
	var disable_ssl = "set ftp:ssl-allow no; ";
	var ssh_key = '';
	
	if (connect_to.protocol == "sftp") {
		disable_ssl = "";
	}
	
	if (connect_to.ssh_key) {
		ssh_key = 'set sftp:connect-program "ssh -a -x -i ' + connect_to.ssh_key + '"; ';
	}
	
	var port = '';
	if (connect_to.port) {
		port = " -p " + connect_to.port;
	}
	
	var comando = disable_ssl + ssh_key + "open -u " + connect_to.login + "," + connect_to.pass + " " + connect_to.protocol + "://" + connect_to.host + " " + port + "; mirror --parallel=10 --exclude \"(header-external-scripts.php|.git|.gitignore|.htaccess|wp-config.php|.c9|node_modules|gulpfile.js|package.json|start.sh)+\" " + connect_to.path + get_rel_path(selected.path) + "/ " + selected.path;

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

function upload() {
	var start = process.hrtime();
	var disable_ssl = "set ftp:ssl-allow no; ";
	var ssh_key = "";
	
	if (connect_to.protocol == "sftp") {
		disable_ssl = "";
	}
	
	if (connect_to.ssh_key) {
		ssh_key = 'set sftp:connect-program "ssh -a -x -i ' + connect_to.ssh_key + '"; ';
	}
	
	var port = '';
	if (connect_to.port) {
		port = " -p " + connect_to.port;
	}
	
	var comando = disable_ssl + ssh_key + "open -u " + connect_to.login + "," + connect_to.pass + " " + connect_to.protocol + "://" + connect_to.host + " " + port + "; mirror --parallel=10 -R --exclude \"(header-external-scripts.php|.git|.gitignore|.htaccess|wp-config.php|.c9|node_modules|gulpfile.js|package.json|start.sh)+\" " + selected.path + "/ " + connect_to.path + get_rel_path(selected.path);

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

function start_webui() {

	const spawn = require('child_process').spawn;
	try {
		process.chdir(selected.path);
		console.log(`New directory: ${process.cwd()}`);
		const grep = spawn('git', ['webui', '--allow-hosts=' + process.env.C9_HOSTNAME, '--port=8082', '--no-browser'], {
			stdio: ['inherit', 'inherit', 'inherit']
		});
	}
	catch (err) {
		console.log(`\x1b[41mError chdir: ${err}\x1b[0m`);
	}
	
};



/*******************************
 * ********* HELPERS ***********
 * *****************************/
 
function get_full_path(path_name) {
	var resolved = node_path.resolve(path_name);
	if (resolved.indexOf(__dirname) == -1) {
		resolved = __dirname + '' + resolved;
	}
	return resolved;
	//return resolved.replace(__dirname, '');
}

function get_rel_path(path_name) {
	return get_full_path(path_name).replace(__dirname, '');
}

function walk(dir) {
	var directory = get_full_path(dir);
    var results = [];
    var list = fs.readdirSync(directory);
    list.forEach(function(file) {
        file = directory + '/' + file;
        var stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
        	results = results.concat(file);
        }
    });
    
    return results;
}

function log(message) {
	return function() {
		gutil.log(message + "\n");
	};
}

function untrailingSlashIt(str) {
	return str.replace(/\/$/, '');
}

function fsExistsSync(myDir) {
	try {
		fs.accessSync(myDir);
		return true;
	} catch (e) {
		return false;
	}
}
