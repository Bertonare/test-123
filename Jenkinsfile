pipeline {
    agent any

    environment {
        // Use Jenkins Credentials Plugin IDs
        OAUTH_CLIENT_ID = credentials('qa-oauth-client-id')
        OAUTH_CLIENT_SECRET = credentials('qa-oauth-client-secret')
        CYPRESS_BASE_URL = "https://staging.example.com"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                script {
                    sh "docker build -t sdet-test-framework:${env.BUILD_ID} ."
                }
            }
        }

        stage('Run Tests') {
            parallel {
                stage('API & Integration Tests') {
                    steps {
                        script {
                            sh """
                            docker run --rm \
                                -e OAUTH_CLIENT_ID=${env.OAUTH_CLIENT_ID} \
                                -e OAUTH_CLIENT_SECRET=${env.OAUTH_CLIENT_SECRET} \
                                sdet-test-framework:${env.BUILD_ID} \
                                npm run test:api
                            """
                        }
                    }
                    post {
                        always {
                            // Archive Jest JUnit reports
                            junit 'reports/junit/*.xml'
                        }
                    }
                }

                stage('Cypress E2E Tests') {
                    steps {
                        script {
                            sh """
                            docker run --rm \
                                -e CYPRESS_BASE_URL=${env.CYPRESS_BASE_URL} \
                                -e CYPRESS_USERNAME=admin \
                                -e CYPRESS_PASSWORD=password \
                                sdet-test-framework:${env.BUILD_ID} \
                                npm run test:e2e:headless
                            """
                        }
                    }
                    post {
                        always {
                            // Archive Cypress JUnit reports
                            junit 'reports/cypress/*.xml'
                            // Archive screenshots on failure
                            archiveArtifacts artifacts: 'cypress/screenshots/**', allowEmptyArchive: true
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            // Clean up Docker image after run
            sh "docker rmi sdet-test-framework:${env.BUILD_ID}"
            cleanWs()
        }
        success {
            echo 'All tests passed successfully!'
        }
        failure {
            echo 'Some tests failed. Please review reports.'
        }
    }
}
