import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DevopsAgentTestingStack } from '../lib/devops-agent-testing-stack';

// === Snapshot Test ===

test('Stack snapshot matches', () => {
  const app = new cdk.App();
  const stack = new DevopsAgentTestingStack(app, 'TestStack');
  const template = Template.fromStack(stack);
  expect(template.toJSON()).toMatchSnapshot();
});

// === Assertion Tests ===

describe('S3 Fault Patterns', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new DevopsAgentTestingStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('FP-S3-001/002: S3 bucket has BLOCK_ALL with no OAC', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    expect(template.findResources('AWS::CloudFront::OriginAccessControl')).toEqual({});
  });

  test('FP-S3-003: Bucket has no DeletionPolicy DESTROY', () => {
    const buckets = template.findResources('AWS::S3::Bucket');
    for (const key of Object.keys(buckets)) {
      expect(buckets[key].DeletionPolicy).not.toBe('Delete');
    }
  });

  test('FP-S3-005: Bucket policy contains hardcoded account ID', () => {
    const policies = template.findResources('AWS::S3::BucketPolicy');
    const policyKeys = Object.keys(policies);
    expect(policyKeys.length).toBeGreaterThan(0);

    // Verify that at least one bucket policy contains the hardcoded account ID
    const templateJson = JSON.stringify(policies);
    expect(templateJson).toContain('123456789012');
  });
});

// === EC2 Fault Patterns ===

describe('EC2 Fault Patterns', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new DevopsAgentTestingStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('FP-EC2-001: Security Group allows SSH from 0.0.0.0/0', () => {
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      SecurityGroupIngress: Match.arrayWith([
        Match.objectLike({
          IpProtocol: 'tcp',
          FromPort: 22,
          ToPort: 22,
          CidrIp: '0.0.0.0/0',
        }),
      ]),
    });
  });

  test('FP-EC2-003: Instance uses hardcoded AMI ID', () => {
    // The CDK genericLinux() creates a Mapping with the hardcoded AMI ID.
    // Verify the mapping contains the hardcoded AMI value.
    const mappings = template.toJSON().Mappings;
    const amiMapKey = Object.keys(mappings).find((key) =>
      key.includes('FaultEc2HardcodedAmi')
    );
    expect(amiMapKey).toBeDefined();
    const amiMap = mappings[amiMapKey!];
    expect(amiMap['ap-northeast-1']['ami']).toBe('ami-0abcdef1234567890');
  });

  test('FP-EC2-005: Instance has no explicit IAM role with S3 permissions', () => {
    // Verify no IAM policy with S3 access is attached to the instance role
    const policies = template.findResources('AWS::IAM::Policy');
    const s3Policies = Object.values(policies).filter((p: any) =>
      JSON.stringify(p.Properties?.PolicyDocument).includes('s3:')
    );
    expect(s3Policies).toHaveLength(0);
  });
});

describe('CloudFront Fault Patterns', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new DevopsAgentTestingStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  test('FP-CF-001: Distribution has no DefaultRootObject', () => {
    const distributions = template.findResources('AWS::CloudFront::Distribution');
    for (const key of Object.keys(distributions)) {
      const config = distributions[key].Properties.DistributionConfig;
      expect(config.DefaultRootObject).toBeUndefined();
    }
  });

  test('FP-CF-002: Distribution error responses return 200 for errors', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: '/index.html',
          }),
        ]),
      }),
    });
  });

  test('FP-CF-003: Distribution uses allow-all', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: 'allow-all',
        }),
      }),
    });
  });
});