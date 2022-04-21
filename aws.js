const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

// User data scripts are run as the root user
function buildUserDataScript(ghtoken, label) {

    return [
        // '#!/bin/bash',
        // 'yum install -y jq',
        // 'export githubRegistrationToken=$(curl -H \"Authorization: token ${ghtoken}\"   -X POST   -H \"Accept: application/vnd.github.v3+json\"   https://api.github.com/repos/${config.githubContext.owner}/${config.githubContext.repo}/actions/runners/registration-token | jq ".token")',
        // 'mkdir actions-runner && cd actions-runner',
        // 'export RUNNER_ARCH=x64',
        // 'curl -O -L https://github.com/actions/runner/releases/download/v2.286.0/actions-runner-linux-x64-2.286.0.tar.gz',
        // 'tar xzf ./actions-runner-linux-${RUNNER_ARCH}-2.286.0.tar.gz',
        // 'export RUNNER_ALLOW_RUNASROOT=1',
        // `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${githubRegistrationToken} --labels ${label}`,
        // './run.sh',
        '#!/bin/bash',
        `cd "${config.input.runnerHomeDir}"`,
        'export RUNNER_ALLOW_RUNASROOT=1',
        `./config.sh --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token ${ghtoken} --labels ${label}`,
        './run.sh',
    ];
}

async function startEc2Instance(ghtoken, label) {
    const ec2 = new AWS.EC2();

    const userData = buildUserDataScript(ghtoken, label);

    const params = {
        ImageId: config.input.ec2ImageId,
        InstanceType: config.input.ec2InstanceType,
        MinCount: 1,
        MaxCount: 1,
        KeyName: 'QA_INSTANCE_KEY',
        UserData: Buffer.from(userData.join('\n')).toString('base64'),
        // SubnetId: config.input.subnetId,
        SecurityGroupIds: [config.input.securityGroupId],
        IamInstanceProfile: { Name: config.input.iamRoleName },
        TagSpecifications: config.tagSpecifications,
        NetworkInterfaces: [
            {
                AssociatePublicIpAddress: true,
                DeviceIndex: '0',
                DeleteOnTermination: true,
                SubnetId: config.input.subnetId
            },
            /* more items */
        ],

    };

    try {
        const result = await ec2.runInstances(params).promise();
        const ec2InstanceId = result.Instances[0].InstanceId;
        core.info(`AWS EC2 instance ${ec2InstanceId} is started`);
        return ec2InstanceId;
    } catch (error) {
        core.error('AWS EC2 instance starting error');
        throw error;
    }
}

async function terminateEc2Instance() {
    const ec2 = new AWS.EC2();

    const params = {
        InstanceIds: [config.input.ec2InstanceId],
    };

    try {
        await ec2.terminateInstances(params).promise();
        core.info(`AWS EC2 instance ${config.input.ec2InstanceId} is terminated`);
        return null;
    } catch (error) {
        core.error(`AWS EC2 instance ${config.input.ec2InstanceId} termination error`);
        throw error;
    }
}

async function waitForInstanceRunning(ec2InstanceId) {
    const ec2 = new AWS.EC2();

    const params = {
        InstanceIds: [ec2InstanceId],
    };

    try {
        await ec2.waitFor('instanceRunning', params).promise();
        core.info(`AWS EC2 instance ${ec2InstanceId} is up and running`);
        return null;
    } catch (error) {
        core.error(`AWS EC2 instance ${ec2InstanceId} initialization error`);
        throw error;
    }
}

module.exports = {
    startEc2Instance,
    terminateEc2Instance,
    waitForInstanceRunning,
};
