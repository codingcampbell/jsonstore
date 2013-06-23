module.exports = function(grunt) {
    grunt.loadNpmTasks('grunt-contrib-coffee');
	grunt.loadNpmTasks('grunt-contrib-watch');

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
			}
		},
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
}
