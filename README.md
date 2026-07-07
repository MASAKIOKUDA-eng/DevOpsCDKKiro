# CDK DevOps Agent Testing

AWS DevOps Agentの障害調査能力を検証するためのCDKテストプロジェクト。  
CloudFront・S3・EC2のシンプルなアーキテクチャ上に、CDK初心者が陥りやすい**13個の設定ミスパターン**を意図的に仕込んでいる。

## プロジェクト概要

| 項目 | 内容 |
|------|------|
| 言語 | TypeScript |
| IaCフレームワーク | AWS CDK v2 |
| リソース構成 | CloudFront + S3 + EC2 (VPC/SecurityGroup) |
| 障害パターン数 | 13パターン |
| テスト | Jest + CDK Assertions (Snapshot + 個別検証) |
| CI/CD | GitHub Actions (OIDC認証) |

### 目的

- AWS DevOps Agentが各障害パターンを正しく検出・診断できるか検証する
- CDK初心者が実際に遭遇する典型的な設定ミスを教育教材として提供する
- CI/CDパイプライン連携による自動検出フローを構築する

## セットアップ手順

### Prerequisites

- Node.js 20.x 以上
- AWS CDK CLI (`npm install -g aws-cdk`)
- AWS アカウント & 認証情報の設定
- Git

### インストール

```bash
# リポジトリのクローン
git clone <repository-url>
cd cdk-devops-agent-testing

# 依存パッケージのインストール
npm install

# TypeScript型チェック
npx tsc --noEmit

# CDK合成テスト（CloudFormationテンプレート生成）
npx cdk synth

# テスト実行（Snapshot + Assertionテスト全14件）
npm test
```

### CDKブートストラップ（初回のみ）

```bash
npx cdk bootstrap aws://<ACCOUNT_ID>/<REGION>
```

### デプロイ

```bash
npx cdk deploy
```

## 障害パターン一覧

全13個の障害パターンを以下に示す。全パターンは `cdk synth` を通過する設計であり、デプロイ時またはランタイムで障害が発現する。

| ID | パターン名 | カテゴリ | 期待される症状 | DevOps Agent診断サマリ |
|----|-----------|---------|--------------|----------------------|
| FP-S3-001 | OAI/OAC未設定 | runtime_error | 403 Access Denied (CloudFront→S3) | OAI/OAC未設定の指摘、S3BucketOrigin + OAC構成への変更を推奨 |
| FP-S3-002 | BlockPublicAccess競合 | runtime_error | 403 Access Denied (BlockPublicAccessとHttpOriginの矛盾) | BlockPublicAccess.BLOCK_ALLとHTTPオリジン設定の矛盾を指摘 |
| FP-S3-003 | removalPolicy未設定 | deployment_failure | スタック削除時に DELETE_FAILED | removalPolicy: cdk.RemovalPolicy.DESTROY 設定の推奨 |
| FP-S3-004 | autoDeleteObjects未設定 | deployment_failure | スタック削除時に BucketNotEmpty | autoDeleteObjects: true 設定の推奨 |
| FP-S3-005 | ハードコードアカウントID | best_practice_violation | 別アカウントデプロイ時にバケットポリシー不正 | Stack.of(this).account 利用の推奨 |
| FP-CF-001 | defaultRootObject未設定 | runtime_error | ルートURL（/）アクセス時 403エラー | defaultRootObject: 'index.html' 設定の推奨 |
| FP-CF-002 | エラーハンドリング不適切 | runtime_error | エラーが200で隠蔽され原因特定困難 | 403/404→200マッピングの不適切なerrorResponses設定を指摘 |
| FP-CF-003 | ViewerProtocolPolicy.ALLOW_ALL | security_risk | HTTP平文通信が可能 | ViewerProtocolPolicy.REDIRECT_TO_HTTPS への変更を推奨 |
| FP-EC2-001 | SSH全開放 (0.0.0.0/0) | security_risk | SSH全世界公開 | CIDR制限の推奨（特定IPレンジのみ許可） |
| FP-EC2-002 | アウトバウンド制限なし | best_practice_violation | 無制限アウトバウンド通信 | 最小権限原則に基づくアウトバウンドルール制限の推奨 |
| FP-EC2-003 | ハードコードAMI ID | best_practice_violation | 別リージョンデプロイ時に AMI not found | MachineImage.latestAmazonLinux2023() の利用を推奨 |
| FP-EC2-004 | パブリックサブネット+EIP無し | runtime_error | EC2再起動時にIPアドレス変更 | EIP付与またはプライベートサブネット+NAT構成の推奨 |
| FP-EC2-005 | IAMロール未付与 | runtime_error | UserData内AWS CLIが権限エラー | IAMインスタンスプロファイル付与の推奨 |

### カテゴリ別分類

| カテゴリ | 説明 | 該当パターン |
|---------|------|------------|
| deployment_failure | デプロイ・削除時に失敗 | FP-S3-003, FP-S3-004 |
| runtime_error | ランタイム時にエラー発生 | FP-S3-001, FP-S3-002, FP-CF-001, FP-CF-002, FP-EC2-004, FP-EC2-005 |
| security_risk | セキュリティスキャンで検出 | FP-CF-003, FP-EC2-001 |
| best_practice_violation | ベストプラクティス違反 | FP-S3-005, FP-EC2-002, FP-EC2-003 |

### セキュリティリスク・ベストプラクティス違反の詳細

以下はデプロイやランタイムでは失敗しないが、DevOps Agentがフラグすべきリソースプロパティと非準拠値の一覧である。

| ID | CloudFormationリソースタイプ | 問題プロパティ | 非準拠値 |
|----|---------------------------|--------------|---------|
| FP-CF-003 | AWS::CloudFront::Distribution | DistributionConfig.DefaultCacheBehavior.ViewerProtocolPolicy | `allow-all` |
| FP-EC2-001 | AWS::EC2::SecurityGroup | SecurityGroupIngress[].CidrIp | `0.0.0.0/0` (port 22) |
| FP-EC2-002 | AWS::EC2::SecurityGroup | SecurityGroupEgress | 全ポート全宛先許可 |
| FP-EC2-003 | AWS::EC2::Instance | ImageId | `ami-0abcdef1234567890` (ハードコード) |
| FP-S3-005 | AWS::S3::BucketPolicy | PolicyDocument.Statement[].Principal.AWS | `123456789012` (ハードコード) |
## CloudFormation論理ID ↔ CDK Construct ID 対応

DevOps Agentが障害を特定する際の参照用。CDK Construct IDからCloudFormation論理IDへの対応を示す。

| CDK Construct ID | CloudFormationリソースタイプ | 関連障害パターン | ソースファイル |
|-----------------|---------------------------|----------------|-------------|
| `FaultBucketNoOac` | AWS::S3::Bucket | FP-S3-001, FP-S3-002, FP-S3-003, FP-S3-004 | lib/devops-agent-testing-stack.ts |
| (BucketPolicy) | AWS::S3::BucketPolicy | FP-S3-005 | lib/devops-agent-testing-stack.ts |
| `FaultDistributionNoRootObject` | AWS::CloudFront::Distribution | FP-CF-001, FP-CF-002, FP-CF-003 | lib/devops-agent-testing-stack.ts |
| `FaultSgOpenSsh` | AWS::EC2::SecurityGroup | FP-EC2-001, FP-EC2-002 | lib/devops-agent-testing-stack.ts |
| `FaultEc2HardcodedAmi` | AWS::EC2::Instance | FP-EC2-003, FP-EC2-004, FP-EC2-005 | lib/devops-agent-testing-stack.ts |
| `Vpc` | AWS::EC2::VPC | (基盤リソース) | lib/devops-agent-testing-stack.ts |

> **Note:** CDK Construct IDには `Fault` プレフィックスを使用し、障害パターン内容を英語で記述する命名規則を採用している。CloudFormation論理IDはCDK Construct IDにハッシュサフィックスが付加される形式（例: `FaultBucketNoOacXXXXXXXX`）となる。

### CDKメタデータ設定

`cdk.json` に以下を設定済み。DevOps Agentがソースコードとの紐付けに活用する。

```json
{
  "@aws-cdk/core:enableStackTrace": true,
  "@aws-cdk/core:pathMetadata": true
}
```

## CI/CDパイプライン

GitHub Actionsによる自動デプロイパイプラインを `.github/workflows/deploy.yml` に定義している。

### トリガー

- `main` ブランチへの `push` イベント

### パイプラインフロー

```
Push to main
  → Checkout
  → Setup Node.js 20
  → npm ci (依存関係インストール)
  → Configure AWS credentials (OIDC)
  → npm test (Jest テスト実行)
  → cdk synth (CloudFormation合成)
  → cdk diff (差分表示)
  → cdk deploy --require-approval never (自動デプロイ)
```

### 特徴

- **OIDC認証**: `aws-actions/configure-aws-credentials@v4` によるGitHub OIDC Provider連携（長期アクセスキー不使用）
- **フェイルファスト**: `cdk synth` 失敗時は後続ステップ未実行
- **ログ保持**: GitHub Actionsのデフォルト90日保持（DevOps Agent調査に十分な期間）
- **テスト実行**: デプロイ前にJestテスト（Snapshot + Assertion）を実行

### 必要なシークレット/変数

| 種別 | 名前 | 説明 |
|------|------|------|
| Secret | `AWS_ROLE_ARN` | OIDC認証用IAMロールのARN |
| Variable | `AWS_REGION` | デプロイ先AWSリージョン |

## AWS DevOps Agent連携方法

AWS DevOps AgentをGitHub Actionsパイプラインと連携させることで、デプロイ失敗やランタイムエラー発生時に自動調査・診断を行う。

### セットアップ手順

1. AWS Management ConsoleでDevOps Agentサービスにアクセス
2. GitHubリポジトリとの接続を設定
3. CI/CDパイプライン（GitHub Actions）との連携を有効化
4. 障害発生時にDevOps Agentが自動的に調査を開始

### 参考ドキュメント

- [AWS DevOps Agent - Connecting to CI/CD Pipelines (GitHub)](https://docs.aws.amazon.com/devopsagent/latest/userguide/connecting-to-cicd-pipelines-connecting-github.html)

### DevOps Agentが活用する情報

- **CloudFormationテンプレート**: `cdk synth` で生成されるテンプレート内のリソース定義
- **CDKメタデータ**: Stack Trace情報によるソースコード行番号の特定
- **Path Metadata**: Construct PathによるCDKリソース階層の追跡
- **CI/CDログ**: GitHub Actionsの実行ログ（失敗ステップ名、終了コード、コマンド出力）

## ディレクトリ構成

```
cdk-devops-agent-testing/
├── bin/
│   └── app.ts                              # CDKアプリケーションエントリポイント
├── lib/
│   └── devops-agent-testing-stack.ts       # メインStack定義（全障害パターン含む）
├── test/
│   └── devops-agent-testing-stack.test.ts  # Snapshot + Assertionテスト
├── docs/
│   └── fault-patterns.md                   # 障害パターン詳細ドキュメント（日本語）
├── .github/
│   └── workflows/
│       └── deploy.yml                      # GitHub Actions CI/CDワークフロー
├── cdk.json                                # CDK設定ファイル
├── package.json                            # Node.js依存関係
├── tsconfig.json                           # TypeScript設定
└── README.md                               # 本ファイル
```

## テスト

```bash
# 全テスト実行（Snapshot 1件 + Assertion 13件）
npm test

# スナップショット更新（Stack変更後）
npx jest --updateSnapshot
```

## ライセンス

このプロジェクトはCDK Conference 2026.7.18向けのデモ・教育用プロジェクトです。