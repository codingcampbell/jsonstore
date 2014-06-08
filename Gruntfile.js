module.exports = function(grunt) {
	grunt.loadNpmTasks('grunt-contrib-clean');
	grunt.loadNpmTasks('grunt-contrib-coffee');
	grunt.loadNpmTasks('grunt-contrib-compress');
	grunt.loadNpmTasks('grunt-contrib-copy');
	grunt.loadNpmTasks('grunt-cafe-mocha');
	grunt.loadNpmTasks('grunt-contrib-watch');

	grunt.initConfig({
		cafemocha: {
			all: {
				src: 'test/**/*.js',
				options: {
					ui: 'bdd',
					reporter: 'spec',
					require: 'should'
				}
			}
		},
		clean: {
			build: ['build/']
		},
		coffee: {
			compile: {
				files: [{
					expand: true,
					cwd: 'src/',
					src: ['**/*.coffee'],
					dest: 'build',
					ext: '.js'
				}]
			},
			test: {
				files: [{
					expand: true,
					cwd: 'test/',
					src: ['**/*.coffee'],
					dest: 'test',
					ext: '.js'
				}]
			}
		},
		compress: {
			build: {
				options: {
					archive: 'release/<%= pkg.name %>-<%= pkg.version %>.tar.gz',
					mode: 'tgz'
				},
				expand: true,
				cwd: 'build/',
				src: ['**/*'],
				dest: '<%= pkg.name %>-<%= pkg.version %>/'
			}
		},
		copy: {
			build: {
				src: 'package.json',
				dest: 'build/'
			}
		},
		pkg: grunt.file.readJSON('package.json'),
		watch: {
			scripts: {
				files: ['src/**/*.coffee'],
				tasks: ['coffee:compile'],
				options: {
				}
			}
		}
	});

	grunt.registerTask('default', ['coffee:compile']);
	grunt.registerTask('test', ['coffee:test', 'cafemocha:all']);

	grunt.registerTask('publish', [
		'clean:build',
		'copy:build',
		'coffee:compile',
		'compress:build'
	]);
}
