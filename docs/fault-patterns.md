# 障害パターンドキュメント

## 概要

本ドキュメントは、AWS DevOps Agentの障害調査能力を検証するために意図的に仕込まれた13個の障害パターンを記述する。各パターンはCDK初心者が実際に遭遇しやすい設定ミスであり、教育目的でも活用できる。

## 重大度レベル定義

| レベル | 説明 |
|---|---|
| Critical | デプロイが失敗する（スタック作成・削除時にエラー） |
| High | ランタイムエラーが発生する（サービス利用時に障害） |
| Medium | セキュリティリスクがある（脆弱性・情報漏洩の可能性） |
| Low | ベストプラクティス違反（運用上の問題が将来発生する可能性） |

## ソースコードマッピングテーブル

| Construct ID | ソースファイル | リソースタイプ | 関連パターン |
|---|---|---|---|
| `FaultBucketNoOac` | `lib/devops-agent-testing-stack.ts` | S3 Bucket | FP-S3-001〜005 |
| `FaultDistributionNoRootObject` | `lib/devops-agent-testing-stack.ts` | CloudFront Distribution | FP-CF-001〜003 |
| `FaultSgOpenSsh` | `lib/devops-agent-testing-stack.ts` | Security Group | FP-EC2-001〜002 |
| `FaultEc2HardcodedAmi` | `lib/devops-agent-testing-stack.ts` | EC2 Instance | FP-EC2-003〜005 |

---

## Critical（デプロイ失敗）

### FP-S3-003: removalPolicy未設定

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-S3-003 |
| **パターン名** | removalPolicy未設定 |
| **カテゴリ** | deployment_failure |
| **重大度** | Critical |
| **難易度** | 初級 |
| **影響リソース** | S3 Bucket |
| **Construct ID** | `FaultBucketNoOac` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
スタック削除時に `DELETE_FAILED` エラーが発生し、S3バケットが孤立リソースとして残留する。CloudFormationスタックが `DELETE_FAILED` 状態のまま残り、手動介入が必要になる。

**根本原因:**
`removalPolicy` を省略すると、CDKはデフォルトで `RemovalPolicy.RETAIN` を適用する。これにより、スタック削除時にバケットが保持され、CloudFormationがリソースの削除をスキップする。開発・テスト環境では意図しない動作となる。

**推奨修正:**
```typescript
const bucket = new s3.Bucket(this, 'FaultBucketNoOac', {
  // ... 既存の設定 ...
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

**学習目標:**
CDKリソースのライフサイクル管理を理解し、`removalPolicy` プロパティの役割と各環境（開発/本番）での適切な設定値を学ぶ。

---

### FP-S3-004: autoDeleteObjects未設定

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-S3-004 |
| **パターン名** | autoDeleteObjects未設定 |
| **カテゴリ** | deployment_failure |
| **重大度** | Critical |
| **難易度** | 初級 |
| **影響リソース** | S3 Bucket |
| **Construct ID** | `FaultBucketNoOac` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
`removalPolicy: DESTROY` を設定しても、バケットにオブジェクトが存在する場合に `BucketNotEmpty` エラーでスタック削除が失敗する。

**根本原因:**
S3バケットはオブジェクトが存在する状態では削除できないAWSの仕様がある。`autoDeleteObjects: true` を設定しないと、CDKはバケット内オブジェクトの自動削除用Lambda関数を作成しないため、非空のバケットが削除できない。

**推奨修正:**
```typescript
const bucket = new s3.Bucket(this, 'FaultBucketNoOac', {
  // ... 既存の設定 ...
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});
```

**学習目標:**
`removalPolicy` と `autoDeleteObjects` の依存関係を理解し、CDKが内部的にCustom Resource（Lambda関数）を生成してバケット内オブジェクトを削除する仕組みを学ぶ。

---

## High（ランタイムエラー）

### FP-S3-001: OAI/OAC未設定

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-S3-001 |
| **パターン名** | OAI/OAC未設定 |
| **カテゴリ** | runtime_error |
| **重大度** | High |
| **難易度** | 中級 |
| **影響リソース** | S3 Bucket / CloudFront Distribution |
| **Construct ID** | `FaultBucketNoOac` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
CloudFront経由でS3コンテンツにアクセスすると `403 Access Denied` エラーが返される。CloudFrontがS3バケットのオブジェクトを取得する権限を持たない。

**根本原因:**
CloudFrontからS3へのアクセスにOAI（Origin Access Identity）またはOAC（Origin Access Control）を設定していない。`HttpOrigin` でS3ウェブサイトエンドポイントを指定しているが、`BlockPublicAccess.BLOCK_ALL` が設定されているためパブリックアクセスがブロックされる。

**推奨修正:**
```typescript
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
  },
});
```

**学習目標:**
CloudFrontとS3のオリジン連携パターン（OAC推奨）を理解し、HttpOriginとS3Originの違い、BlockPublicAccessとの関係を学ぶ。

---

### FP-S3-002: BlockPublicAccess競合

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-S3-002 |
| **パターン名** | BlockPublicAccess競合 |
| **カテゴリ** | runtime_error |
| **重大度** | High |
| **難易度** | 中級 |
| **影響リソース** | S3 Bucket |
| **Construct ID** | `FaultBucketNoOac` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
S3バケットを静的ウェブサイトホスティング用に設定（`websiteIndexDocument`）しているにも関わらず、`BlockPublicAccess.BLOCK_ALL` により全てのパブリックアクセスがブロックされ、ウェブサイトエンドポイント経由のアクセスが `403 Access Denied` となる。

**根本原因:**
`websiteIndexDocument` の設定はS3ウェブサイトホスティング機能を有効化するが、`BlockPublicAccess.BLOCK_ALL` が同時に設定されているため、パブリックアクセスが完全にブロックされる。この2つの設定は論理的に矛盾しており、HttpOrigin経由でのアクセスが不可能になる。

**推奨修正:**
OAC（Origin Access Control）を使用してCloudFrontからのみアクセスを許可する構成に変更する。ウェブサイトホスティング機能は不要になるため削除する。

```typescript
const bucket = new s3.Bucket(this, 'Bucket', {
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  // websiteIndexDocument は削除（OAC利用時は不要）
});

const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
  },
  defaultRootObject: 'index.html',
});
```

**学習目標:**
S3の静的ウェブサイトホスティングとBlockPublicAccessの関係性を理解し、CloudFrontとの正しい連携パターンを学ぶ。

---

### FP-CF-001: defaultRootObject未設定

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-CF-001 |
| **パターン名** | defaultRootObject未設定 |
| **カテゴリ** | runtime_error |
| **重大度** | High |
| **難易度** | 中級 |
| **影響リソース** | CloudFront Distribution |
| **Construct ID** | `FaultDistributionNoRootObject` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
CloudFrontディストリビューションのルートURL（`https://dxxxxxx.cloudfront.net/`）にアクセスすると `403 Forbidden` エラーが返される。パス付きURL（`/index.html`）では正常応答する場合がある。

**根本原因:**
`defaultRootObject` が未設定のため、ルートURL（`/`）へのリクエストがオリジンに `/` として転送される。S3にはキー `/` のオブジェクトが存在しないため、403または404エラーが発生する。

**推奨修正:**
```typescript
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: { /* ... */ },
  defaultRootObject: 'index.html',
});
```

**学習目標:**
CloudFrontの `defaultRootObject` の仕組みを理解し、SPAやウェブサイト配信時のルートアクセス設定を学ぶ。

---

### FP-EC2-004: パブリックサブネット+EIP無し

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-EC2-004 |
| **パターン名** | パブリックサブネット+EIP無し |
| **カテゴリ** | runtime_error |
| **重大度** | High |
| **難易度** | 中級 |
| **影響リソース** | EC2 Instance |
| **Construct ID** | `FaultEc2HardcodedAmi` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
EC2インスタンスを再起動するとパブリックIPアドレスが変更される。DNS設定やファイアウォールルールで旧IPを参照しているシステムが接続不能になる。

**根本原因:**
パブリックサブネットに配置されたEC2インスタンスにElastic IP（EIP）を割り当てていない。Auto-assignされるパブリックIPは一時的なものであり、インスタンスの停止・起動で変更される。

**推奨修正:**
```typescript
// 方法1: Elastic IPを付与する
const eip = new ec2.CfnEIP(this, 'InstanceEip');
new ec2.CfnEIPAssociation(this, 'EipAssoc', {
  eip: eip.ref,
  instanceId: instance.instanceId,
});

// 方法2: プライベートサブネット + NAT Gateway構成にする
const instance = new ec2.Instance(this, 'Instance', {
  vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
});
```

**学習目標:**
EC2のパブリックIP割り当て方式の違い（Auto-assign vs EIP）を理解し、本番環境での安定したネットワーク構成パターンを学ぶ。

---

### FP-EC2-005: IAMロール未付与

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-EC2-005 |
| **パターン名** | IAMロール未付与 |
| **カテゴリ** | runtime_error |
| **重大度** | High |
| **難易度** | 中級 |
| **影響リソース** | EC2 Instance |
| **Construct ID** | `FaultEc2HardcodedAmi` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
EC2インスタンスのUserDataで実行される `aws s3 ls` コマンドが `Unable to locate credentials` エラーで失敗する。EC2上でAWS CLIやSDKを使用するアプリケーションが権限エラーとなる。

**根本原因:**
EC2インスタンスにIAMインスタンスプロファイル（IAMロール）が付与されていない。UserDataにAWS CLIコマンドを含むにも関わらず、インスタンスが適切なAWS認証情報を取得できない。

**推奨修正:**
```typescript
const role = new iam.Role(this, 'InstanceRole', {
  assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonS3ReadOnlyAccess'),
  ],
});

const instance = new ec2.Instance(this, 'Instance', {
  // ... 既存の設定 ...
  role: role,
});
```

**学習目標:**
EC2インスタンスへのIAMロール付与の重要性を理解し、インスタンスプロファイルを通じたAWS認証情報の自動提供メカニズムを学ぶ。

---

## Medium（セキュリティリスク）

### FP-CF-002: エラーハンドリング不適切

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-CF-002 |
| **パターン名** | エラーハンドリング不適切 |
| **カテゴリ** | runtime_error |
| **重大度** | Medium |
| **難易度** | 上級 |
| **影響リソース** | CloudFront Distribution |
| **Construct ID** | `FaultDistributionNoRootObject` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
存在しないパスへのアクセスや権限エラーが全て HTTP 200 + `/index.html` として返却される。実際のエラー原因が隠蔽され、デバッグが極めて困難になる。監視ツールが異常を検知できない。

**根本原因:**
`errorResponses` で403および404エラーをHTTP 200にマッピングし、`/index.html` を返す設定にしている。これはSPA対応を意図した設定だが、実際のサーバーエラーやアクセス拒否エラーまでも200として返してしまい、障害の検出を妨げる。

**推奨修正:**
```typescript
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  // ... 既存の設定 ...
  errorResponses: [
    {
      httpStatus: 404,
      responseHttpStatus: 404,
      responsePagePath: '/404.html',
      ttl: cdk.Duration.minutes(5),
    },
    // 403はカスタムエラーレスポンスから除外し、そのまま返す
  ],
});
```

**学習目標:**
CloudFrontのカスタムエラーレスポンスの動作を理解し、SPA対応と適切なエラーハンドリングのバランスを取る設計パターンを学ぶ。

---

### FP-CF-003: ViewerProtocolPolicy.ALLOW_ALL

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-CF-003 |
| **パターン名** | ViewerProtocolPolicy.ALLOW_ALL |
| **カテゴリ** | security_risk |
| **重大度** | Medium |
| **難易度** | 初級 |
| **影響リソース** | CloudFront Distribution |
| **Construct ID** | `FaultDistributionNoRootObject` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
セキュリティスキャンで「HTTP平文通信が許可されている」と警告される。ユーザーがHTTPでアクセスした場合、通信内容が暗号化されず中間者攻撃のリスクがある。

**根本原因:**
`ViewerProtocolPolicy.ALLOW_ALL` が設定されているため、HTTPとHTTPSの両方でのアクセスを許可している。HTTPSへのリダイレクトが行われず、ユーザーの通信が平文で送信される可能性がある。

**推奨修正:**
```typescript
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: /* ... */,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  },
});
```

**学習目標:**
CloudFrontのViewerProtocolPolicyの各オプション（ALLOW_ALL / HTTPS_ONLY / REDIRECT_TO_HTTPS）の違いを理解し、HTTPS強制の重要性を学ぶ。

---

### FP-EC2-001: SSH全開放 (0.0.0.0/0)

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-EC2-001 |
| **パターン名** | SSH全開放 (0.0.0.0/0) |
| **カテゴリ** | security_risk |
| **重大度** | Medium |
| **難易度** | 初級 |
| **影響リソース** | Security Group |
| **Construct ID** | `FaultSgOpenSsh` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
セキュリティスキャンで「SSHポートがインターネット全体に公開されている」と警告される。ブルートフォース攻撃の対象となり、不正アクセスのリスクが高まる。

**根本原因:**
Security Groupのインバウンドルールで、SSHポート（22）への接続元を `0.0.0.0/0`（全IPアドレス）に設定している。これによりインターネット上の任意のホストからSSH接続が試行可能になる。

**推奨修正:**
```typescript
// 方法1: 特定IPアドレスに制限する
sg.addIngressRule(
  ec2.Peer.ipv4('203.0.113.0/24'),
  ec2.Port.tcp(22),
  'SSH from office network only'
);

// 方法2: SSMセッションマネージャーを使用し、SSHポートを閉じる
// Security GroupのSSHルールを削除し、IAMロールにSSMポリシーを付与する
```

**学習目標:**
最小権限原則に基づくSecurity Group設計を理解し、SSH接続の代替手段（SSM Session Manager等）を学ぶ。

---

## Low（ベストプラクティス違反）

### FP-S3-005: ハードコードアカウントID

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-S3-005 |
| **パターン名** | ハードコードアカウントID |
| **カテゴリ** | best_practice_violation |
| **重大度** | Low |
| **難易度** | 初級 |
| **影響リソース** | S3 Bucket Policy |
| **Construct ID** | `FaultBucketNoOac` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
別のAWSアカウントにデプロイした際にバケットポリシーが不正になり、意図しないアカウントへの権限付与が行われる。マルチアカウント環境でのデプロイが失敗する。

**根本原因:**
バケットポリシーのPrincipalに `123456789012` というハードコードされたアカウントIDを使用している。CDKでは `Stack.of(this).account` を使用することで、デプロイ先アカウントを動的に参照すべきである。

**推奨修正:**
```typescript
bucket.addToResourcePolicy(new iam.PolicyStatement({
  actions: ['s3:GetObject'],
  resources: [bucket.arnForObjects('*')],
  principals: [new iam.AccountPrincipal(cdk.Stack.of(this).account)],
}));
```

**学習目標:**
CDKにおける環境依存値の動的参照パターンを理解し、`Stack.of(this).account` や `Stack.of(this).region` の使い方を学ぶ。

---

### FP-EC2-002: アウトバウンド制限なし

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-EC2-002 |
| **パターン名** | アウトバウンド制限なし |
| **カテゴリ** | best_practice_violation |
| **重大度** | Low |
| **難易度** | 中級 |
| **影響リソース** | Security Group |
| **Construct ID** | `FaultSgOpenSsh` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
セキュリティ監査で「アウトバウンドトラフィックが無制限」と指摘される。マルウェア感染時にデータ流出や外部C2サーバーとの通信が制限なく行われるリスクがある。

**根本原因:**
Security Groupの `allowAllOutbound: true` 設定により、EC2インスタンスから全ての宛先・ポートへのアウトバウンド通信が許可されている。最小権限原則に反する。

**推奨修正:**
```typescript
const sg = new ec2.SecurityGroup(this, 'Sg', {
  vpc,
  allowAllOutbound: false, // デフォルトのアウトバウンドルールを無効化
});

// 必要な通信先のみ許可する
sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS outbound');
sg.addEgressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP outbound');
```

**学習目標:**
アウトバウンドルールの重要性を理解し、最小権限原則に基づいたSecurity Group設計パターンを学ぶ。

---

### FP-EC2-003: ハードコードAMI ID

| 項目 | 内容 |
|---|---|
| **パターンID** | FP-EC2-003 |
| **パターン名** | ハードコードAMI ID |
| **カテゴリ** | best_practice_violation |
| **重大度** | Low |
| **難易度** | 中級 |
| **影響リソース** | EC2 Instance |
| **Construct ID** | `FaultEc2HardcodedAmi` |
| **ソースファイル** | `lib/devops-agent-testing-stack.ts` |

**症状:**
別リージョンへのデプロイ時に `AMI not found` エラーが発生する。AMI IDはリージョン固有であるため、`ap-northeast-1` 以外のリージョンではインスタンスが作成できない。

**根本原因:**
`ami-0abcdef1234567890` というハードコードされたAMI IDを使用している。AMI IDはリージョンごとに異なるため、マルチリージョンデプロイやDR構成で問題が発生する。また、AMIは定期的に更新されるため、古いAMI IDが無効になる可能性もある。

**推奨修正:**
```typescript
const instance = new ec2.Instance(this, 'Instance', {
  // ... 既存の設定 ...
  machineImage: ec2.MachineImage.latestAmazonLinux2023(),
});
```

**学習目標:**
CDKのMachineImageルックアップ機能を理解し、リージョン非依存で常に最新のAMIを参照する方法を学ぶ。

---

## 障害パターン一覧サマリー

| ID | パターン名 | カテゴリ | 重大度 | 難易度 | Construct ID | 発現タイミング |
|---|---|---|---|---|---|---|
| FP-S3-001 | OAI/OAC未設定 | runtime_error | High | 中級 | FaultBucketNoOac | ランタイム |
| FP-S3-002 | BlockPublicAccess競合 | runtime_error | High | 中級 | FaultBucketNoOac | ランタイム |
| FP-S3-003 | removalPolicy未設定 | deployment_failure | Critical | 初級 | FaultBucketNoOac | スタック削除時 |
| FP-S3-004 | autoDeleteObjects未設定 | deployment_failure | Critical | 初級 | FaultBucketNoOac | スタック削除時 |
| FP-S3-005 | ハードコードアカウントID | best_practice_violation | Low | 初級 | FaultBucketNoOac | 別アカウントデプロイ時 |
| FP-CF-001 | defaultRootObject未設定 | runtime_error | High | 中級 | FaultDistributionNoRootObject | ランタイム |
| FP-CF-002 | エラーハンドリング不適切 | runtime_error | Medium | 上級 | FaultDistributionNoRootObject | ランタイム |
| FP-CF-003 | ViewerProtocolPolicy.ALLOW_ALL | security_risk | Medium | 初級 | FaultDistributionNoRootObject | セキュリティスキャン時 |
| FP-EC2-001 | SSH全開放 (0.0.0.0/0) | security_risk | Medium | 初級 | FaultSgOpenSsh | セキュリティスキャン時 |
| FP-EC2-002 | アウトバウンド制限なし | best_practice_violation | Low | 中級 | FaultSgOpenSsh | セキュリティ監査時 |
| FP-EC2-003 | ハードコードAMI ID | best_practice_violation | Low | 中級 | FaultEc2HardcodedAmi | 別リージョンデプロイ時 |
| FP-EC2-004 | パブリックサブネット+EIP無し | runtime_error | High | 中級 | FaultEc2HardcodedAmi | EC2再起動時 |
| FP-EC2-005 | IAMロール未付与 | runtime_error | High | 中級 | FaultEc2HardcodedAmi | ランタイム |
