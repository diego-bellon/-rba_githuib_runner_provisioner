const AWS = require('aws-sdk');
const core = require('@actions/core');
const config = require('./config');

// User data scripts are run as the root user
function buildUserDataScript(ghtoken, label, runnerVersion) {
    const userData = [
        '#!/bin/bash -xe',
        'exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1',
        'echo "Hello from user-data!"',
        'export random=`shuf -i 5-15 -n 1`',
        'echo "sleep:... $random"',
        'sleep $random',
        'cd /actions-runnner',
        `export RUNNER_ARCH=x64`,
        'export RUNNER_ALLOW_RUNASROOT=1',
        //put content in new .sh file
        `echo "#!/bin/bash" > get-runner-token.sh`,
        `echo "set -e" >> get-runner-token.sh`,
        `echo "#SDP validations" >> get-runner-token.sh`,
        `echo "date1_start=\\$(date --date='+0 seconds'  +\\"%Y-%m-%d %H:%M:%S\\")" >> get-runner-token.sh`,
        `echo "date1_finish=\\$(date --date='+1 minutes' +\\"%Y-%m-%d %H:%M:%S\\")" >> get-runner-token.sh`,
        `echo "while [[ \\$date1_start < \\$date1_finish ]]; do" >> get-runner-token.sh`,
        `echo " status=\\$(appgate_service_configurator status | jq -r .status)" >> get-runner-token.sh`,
        `echo " echo \\"Appgate SDP status is \\$status \\"" >> get-runner-token.sh`,
        `echo " if [ \\$status == \\"Connected\\" ]; then" >> get-runner-token.sh`,
        `echo "  echo \\"Its now connected\\"" >> get-runner-token.sh`,
        `echo "  break" >> get-runner-token.sh`,
        `echo " else" >> get-runner-token.sh`,
        `echo "  echo \\"SDP not connected yet. Still waiting\\"" >> get-runner-token.sh`,
        `echo "  sleep 5" >> get-runner-token.sh`,
        `echo " fi" >> get-runner-token.sh`,
        `echo "done" >> get-runner-token.sh`,
        `echo "if [ \\$status != \\"Connected\\" ]; then" >> get-runner-token.sh`,
        `echo " appgate_service_configurator reload" >> get-runner-token.sh`,
        `echo "fi" >> get-runner-token.sh`,
        `echo "#Getting registration token" >> get-runner-token.sh`,
        `echo "date_start=\\$(date --date='+0 seconds'  +\\"%Y-%m-%d %H:%M:%S\\")" >> get-runner-token.sh`,
        `echo "date_finish=\\$(date --date='+5 minutes' +\\"%Y-%m-%d %H:%M:%S\\")" >> get-runner-token.sh`,
        `echo "registration_token=\\"null\\"" >> get-runner-token.sh`,
        `echo "while [[ \\"\\$registration_token\\" == \\"null\\" && \\$date_start < \\$date_finish ]]; do" >> get-runner-token.sh`,
        `echo " date_start=\\$(date --date='+0 seconds'  +\\"%Y-%m-%d %H:%M:%S\\")" >> get-runner-token.sh`,
        `echo " response=\\$(curl -H \\"Authorization: token ${ghtoken}\\" -X POST -H \\"Accept: application/vnd.github.v3+json\\" https://api.github.com/repos/${config.githubContext.owner}/${config.githubContext.repo}/actions/runners/registration-token)" >> get-runner-token.sh`,
        `echo " registration_token=\\$(echo \\"\\$response\\" | jq -r .token)" >> get-runner-token.sh`,
        'echo " sleep 20" >> get-runner-token.sh',
        'echo "done" >> get-runner-token.sh',
        'echo "echo \\"TOKEN FINALLY IS \\$registration_token\\"" >> get-runner-token.sh',
        `echo "appgate_service_configurator reload" >> get-runner-token.sh`,
        `echo "./config.sh --unattended --url https://github.com/${config.githubContext.owner}/${config.githubContext.repo} --token \\$registration_token --labels ${label} --name self-hosted-runner-${config.generateUniqueLabel()} --replace --disableupdate" >> get-runner-token.sh`,
        `echo "appgate_service_configurator reload" >> get-runner-token.sh`,
        `echo "./run.sh" >> get-runner-token.sh`,
        'chmod a+x get-runner-token.sh',
        './get-runner-token.sh'
    ];
    core.info(userData.join('\n').toString('base64'));
    return userData;
}

async function startEc2Instance(ghtoken, label, runnerVersion) {
    const ec2 = new AWS.EC2();

    const userData = buildUserDataScript(ghtoken, label, runnerVersion);
    const params = {
        ImageId: config.input.ec2ImageId,
        InstanceType: config.input.ec2InstanceType,
        MinCount: 1,
        MaxCount: 1,
        KeyName: 'QA_INSTANCE_KEY',
        UserData: Buffer.from(userData.join('\n')).toString('base64'),
        // SubnetId: config.input.subnetId,
        // SecurityGroupIds: [config.input.securityGroupId],
        IamInstanceProfile: { Name: config.input.iamRoleName },
        TagSpecifications: config.tagSpecifications,
        NetworkInterfaces: [
            {
                AssociatePublicIpAddress: true,
                DeviceIndex: '0',
                DeleteOnTermination: true,
                SubnetId: config.input.subnetId,
                Groups: [config.input.securityGroupId],
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
