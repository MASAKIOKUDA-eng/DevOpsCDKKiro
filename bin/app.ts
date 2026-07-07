import * as cdk from 'aws-cdk-lib';
import { DevopsAgentTestingStack } from '../lib/devops-agent-testing-stack';

const app = new cdk.App();
new DevopsAgentTestingStack(app, 'DevopsAgentTestingStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
