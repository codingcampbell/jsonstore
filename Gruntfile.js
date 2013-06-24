module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-contrib-coffee');
	grunt.loadNpmTasks('grunt-contrib-watch');
	grunt.loadNpmTasks('grunt-cafe-mocha');

    grunt.initConfig({
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
		watch: {
			scripts: {
				files: ['src/**/*.coffee'],
				tasks: ['coffee:compile'],
				options: {
				}
			}
		},
		cafemocha: {
			all: {
				src: 'test/**/*.js',
				options: {
					ui: 'bdd',
					reporter: 'spec',
					require: 'should'
				}
			}
		}
    });

    grunt.registerTask('default', ['coffee:compile']);
    grunt.registerTask('test', ['coffee:test', 'cafemocha:all']);
}
