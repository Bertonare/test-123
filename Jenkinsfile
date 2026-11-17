pipeline {
    agent any

    parameters {
        choice(
            name: 'PROJECT',
            choices: ['all', 'auth-service', 'users-service', 'orders-service', 'web-portal', 'platform'],
            description: 'Target microservice or frontend project'
        )
        choice(
            name: 'ENVIRONMENT',
            choices: ['local', 'dev', 'qa', 'staging'],
            description: 'Target environment profile from config/environments/*.json'
        )
        choice(
            name: 'TEST_LAYER',
            choices: ['all', 'backend-api', 'backend-integration', 'frontend-e2e'],
            description: 'Test layer to run'
        )
        choice(
            name: 'CASE_TYPE',
            choices: ['all', 'positive', 'negative', 'edge'],
            description: 'Filter tests by positive, negative, or edge cases'
        )
        string(name: 'TAGS', defaultValue: '', description: 'Optional test tag filter (e.g. smoke)')
        string(name: 'GIT_BRANCH', defaultValue: 'main', description: 'Git branch to test')
    }

    environment {
        OAUTH_CLIENT_ID = credentials('qa-oauth-client-id')
        OAUTH_CLIENT_SECRET = credentials('qa-oauth-client-secret')
        TEST_ENV = "${params.ENVIRONMENT}"
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

        stage('Static Analysis & Typecheck') {
            steps {
                script {
                    sh "docker run --rm sdet-test-framework:${env.BUILD_ID} npm run typecheck"
                }
            }
        }

        stage('Run Parameterized Tests') {
            parallel {
                stage('Backend API & Integration') {
                    when {
                        expression {
                            params.TEST_LAYER in ['all', 'backend-api', 'backend-integration'] &&
                            params.PROJECT != 'web-portal'
                        }
                    }
                    steps {
                        script {
                            def projFlag = params.PROJECT == 'all' ? '' : "--project=${params.PROJECT}"
                            def tagsFlag = params.TAGS?.trim() ? "--tags=${params.TAGS.trim()}" : ''
                            def caseFlag = "--caseType=${params.CASE_TYPE ?: 'all'}"
                            def layers = params.TEST_LAYER == 'all'
                                ? ['backend-api', 'backend-integration']
                                : [params.TEST_LAYER]

                            for (layerItem in layers) {
                                sh """
                                mkdir -p reports/junit
                                docker run --rm \
                                    -v \${WORKSPACE}/reports:/app/reports \
                                    -e TEST_ENV=\${TEST_ENV} \
                                    -e OAUTH_CLIENT_ID=\${OAUTH_CLIENT_ID} \
                                    -e OAUTH_CLIENT_SECRET=\${OAUTH_CLIENT_SECRET} \
                                    sdet-test-framework:${env.BUILD_ID} \
                                    npx ts-node src/scripts/run-all.ts ${projFlag} --env=\${TEST_ENV} --layer=${layerItem} ${caseFlag} ${tagsFlag}
                                """
                            }
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'reports/junit/*.xml'
                        }
                    }
                }

                stage('Frontend Cypress E2E') {
                    when {
                        expression {
                            params.TEST_LAYER in ['all', 'frontend-e2e'] &&
                            params.PROJECT in ['all', 'web-portal']
                        }
                    }
                    steps {
                        script {
                            def tagsFlag = params.TAGS?.trim() ? "--tags=${params.TAGS.trim()}" : ''
                            def caseFlag = "--caseType=${params.CASE_TYPE ?: 'all'}"
                            sh """
                            mkdir -p reports/cypress cypress/screenshots
                            docker run --rm \
                                -v \${WORKSPACE}/reports:/app/reports \
                                -v \${WORKSPACE}/cypress/screenshots:/app/cypress/screenshots \
                                -e TEST_ENV=\${TEST_ENV} \
                                -e CYPRESS_USERNAME=admin \
                                -e CYPRESS_PASSWORD=password \
                                sdet-test-framework:${env.BUILD_ID} \
                                npx ts-node src/scripts/run-all.ts --project=web-portal --env=\${TEST_ENV} --layer=frontend-e2e ${caseFlag} ${tagsFlag}
                            """
                        }
                    }
                    post {
                        always {
                            junit allowEmptyResults: true, testResults: 'reports/cypress/*.xml'
                            archiveArtifacts artifacts: 'cypress/screenshots/**', allowEmptyArchive: true
                        }
                    }
                }
            }
        }
    }

    post {
        always {
            sh "docker rmi sdet-test-framework:${env.BUILD_ID} || true"
            cleanWs()
        }
        success {
            echo "Build #${env.BUILD_NUMBER} PASSED for PROJECT=${params.PROJECT}, ENV=${params.ENVIRONMENT}"
        }
        failure {
            echo "Build #${env.BUILD_NUMBER} FAILED for PROJECT=${params.PROJECT}, ENV=${params.ENVIRONMENT}"
        }
    }
}
