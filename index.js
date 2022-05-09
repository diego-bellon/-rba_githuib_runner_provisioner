const aws = require('./aws');
const github = require('./github');
const config = require('./config');
const core = require('@actions/core');

function setOutput(label, ec2InstanceId) {
    core.setOutput('label', label);
    core.setOutput('ec2-instance-id', ec2InstanceId);
}

async function start() {
    const label = config.generateUniqueLabel();
    const githubtoken = config.input.githubtoken;
    const runnerVersion = config.input.runnerVersion;
    // const githubRegistrationToken = await github.getRegistrationToken();
    const ec2InstanceId = await aws.startEc2Instance(githubtoken,label,runnerVersion);
    setOutput(label, ec2InstanceId);
    await aws.waitForInstanceRunning(ec2InstanceId);
    // await gh.waitForRunnerRegistered(label);
}

async function stop() {
    await github.removeRunnerFromRepo();
    await aws.terminateEc2Instance();
}

(async function () {
    try {
        config.input.mode === 'start' ? await start() : await stop();
    } catch (error) {
        core.error(error);
        core.setFailed(error.message);
    }
})();
