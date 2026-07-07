import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

export class DevopsAgentTestingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // === S3 Bucket (Fault Patterns: FP-S3-001〜005) ===

    // FP-S3-001: OAI/OAC未設定 — CloudFrontからのアクセスにOAI/OACを使用していない
    // FP-S3-002: BlockPublicAccess.BLOCK_ALLとウェブサイトホスティングの競合
    const bucket = new s3.Bucket(this, 'FaultBucketNoOac', {
      websiteIndexDocument: 'index.html',
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // FP-S3-003: removalPolicy未指定 → デフォルトRETAIN（スタック削除時にバケットが残留）
      // FP-S3-004: autoDeleteObjects未指定（スタック削除時にBucketNotEmptyエラー）
    });

    // FP-S3-005: ハードコードアカウントID（環境移行時にバケットポリシーが不正になる）
    bucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [bucket.arnForObjects('*')],
      principals: [new iam.AccountPrincipal('123456789012')],
    }));

    // === CloudFront Distribution (Fault Patterns: FP-CF-001〜003) ===

    // FP-CF-001: OAI/OACを使わずHttpOriginでS3ウェブサイトエンドポイントを指定
    //            + defaultRootObject未設定（ルートURL 403エラー）
    // FP-CF-002: 403/404エラーを200 + /index.htmlで隠蔽（エラーハンドリング不適切）
    // FP-CF-003: ViewerProtocolPolicy.ALLOW_ALL（HTTP平文通信を許可）
    const distribution = new cloudfront.Distribution(this, 'FaultDistributionNoRootObject', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(
          bucket.bucketWebsiteDomainName
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.ALLOW_ALL,
      },
      // defaultRootObject未指定（FP-CF-001）
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    // === VPC / Security Group / EC2 Instance (Fault Patterns: FP-EC2-001〜005) ===

    const vpc = new ec2.Vpc(this, 'Vpc', { maxAzs: 2 });

    // FP-EC2-001: SSH全開放 (0.0.0.0/0)
    // FP-EC2-002: アウトバウンド制限なし
    const sg = new ec2.SecurityGroup(this, 'FaultSgOpenSsh', {
      vpc,
      allowAllOutbound: true, // FP-EC2-002
    });
    sg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH from anywhere'); // FP-EC2-001

    // FP-EC2-003: ハードコードAMI ID
    // FP-EC2-004: パブリックサブネット+EIP無し
    // FP-EC2-005: IAMロール未付与（UserDataにAWS CLIコマンドを設定）
    const instance = new ec2.Instance(this, 'FaultEc2HardcodedAmi', {
      vpc,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.genericLinux({
        'ap-northeast-1': 'ami-0abcdef1234567890', // FP-EC2-003
      }),
      securityGroup: sg,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }, // FP-EC2-004
      // IAMロール未指定（FP-EC2-005）
    });
    instance.addUserData('aws s3 ls'); // FP-EC2-005: 権限なしでAWS CLIを実行
  }
}