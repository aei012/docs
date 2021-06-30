const atob = require('atob')
const axios = require('axios')

const GITLAB_ACCESS_TOKEN = process.env.GITLAB_ACCESS_TOKEN

const { DefaultAzureCredential } = require('@azure/identity')
const { SecretClient } = require('@azure/keyvault-secrets')

const AZURE_VAULT_NAME = process.env.AZURE_VAULT_NAME
const credential = new DefaultAzureCredential()
const valutClient = new SecretClient(AZURE_VAULT_NAME, credential)

const baseHelmValueDescriptionUrlForGitlab =
	'https://gitlab.com/api/v4/projects/genus%2Fhelm-charts%2Fgenus-operator/repository/files/helm-values-description.md?ref='

const baseHelmValueDescriptionUrlForGithub =
	'developers/installation-and-configuration/deploying-genus-10-on-kubernetes/genus-operator/helm-values-description/genus-operator-'

let githubApi

async function startFetchGenusOperatorHelmValuesDescription(api) {
	githubApi = api

	//eslint-disable-next-line
	console.log('Update Genus Operator Helm Values Description in Docs')

	await fetchHelmValueDescriptionFromGitlab('3.0.0')
}

async function fetchHelmValueDescriptionFromGitlab(fromGitlabTag) {
	const gitlabAccessToken = await valutClient.getSecret(GITLAB_ACCESS_TOKEN)

	const options = {
		url: baseHelmValueDescriptionUrlForGitlab + fromGitlabTag,
		method: 'get',
		headers: {
			'PRIVATE-TOKEN': gitlabAccessToken.value,
		},
	}

	const response = await axios(options)
	const body = response.data

	const { githubSha, githubContent } = await new Promise((resolve) => {
		githubApi.contents(baseHelmValueDescriptionUrlForGithub + fromGitlabTag + '.md', function (err, data) {
			if (!data) {
				resolve({})
				return
			}
			resolve({ githubSha: data.sha, githubContent: atob(data.content) })
		})
	})

	if (!githubSha || !githubContent) {
		//eslint-disable-next-line
		console.log('1. Release ' + fromGitlabTag + ' not found in docs. Most likely not created')
		return
	}

	const content = atob(body.content)

	const refactoredContent = content
		.split('./genus-operator/values.yaml')
		.join('../genus-operator/default-helm-values/genus-' + fromGitlabTag + '.md')

	if (githubContent === refactoredContent) {
		//eslint-disable-next-line
		console.log('2. Content is equal')
		return
	}

	if (body.blob_id === githubSha) {
		//eslint-disable-next-line
		console.log('3. SHA is equal')
		return
	}

	await new Promise((resolve) => {
		githubApi.updateContents(
			baseHelmValueDescriptionUrlForGithub + fromGitlabTag + '.md',
			'Auto update of helm-values from Gitlab',
			refactoredContent,
			githubSha,
			function () {
				//eslint-disable-next-line
				console.log('Finished pushing updated helm-values to github')
				resolve()
			}
		)
	})
}

module.exports = { startFetchGenusOperatorHelmValuesDescription }
