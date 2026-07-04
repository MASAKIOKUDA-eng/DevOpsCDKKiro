# 要件定義書

## はじめに

本プロジェクトは、AWS DevOps Agentを用いたCDKコードの障害調査能力を検証するためのテスト用CDKプロジェクトである。CloudFront・S3・EC2のシンプルな構成に対して、CDK初心者が陥りやすい典型的な設定ミスパターンを意図的に仕込み、DevOps Agentによる検出・診断が正しく機能することを確認する。

## 用語集

- **CDK_Project**: AWS CDK（TypeScript）で記述されたInfrastructure as Codeプロジェクト
- **DevOps_Agent**: AWS DevOps Agentサービス。CI/CDパイプライン連携を通じてコードの障害調査・診断を行うAIエージェント
- **Fault_Pattern**: CDK初心者が引っ掛かる典型的な設定ミスパターン。意図的にコードに挿入される
- **S3_Bucket**: Amazon S3バケット。静的コンテンツのホスティングに使用する
- **CloudFront_Distribution**: Amazon CloudFrontディストリビューション。CDN配信を行う
- **EC2_Instance**: Amazon EC2インスタンス。バックエンドアプリケーションを実行する
- **OAI**: Origin Access Identity。CloudFrontからS3へのアクセス制御に使用するレガシーな仕組み
- **OAC**: Origin Access Control。CloudFrontからS3へのアクセス制御に使用する推奨される仕組み
- **Security_Group**: EC2インスタンスに適用するファイアウォールルール
- **CI_CD_Pipeline**: GitHub Actionsを使用した継続的インテグレーション・デリバリーパイプライン
- **Stack**: CDKにおけるデプロイ単位。CloudFormationスタックに対応する

## 要件

### 要件1: CDKプロジェクト基本構成

**ユーザーストーリー:** 開発者として、TypeScriptで記述されたCDKプロジェクトの雛形が欲しい。これにより、CloudFront・S3・EC2構成のインフラ定義を迅速に開始できる。

#### 受入条件

1. THE CDK_Project SHALL use TypeScript as the programming language with AWS CDK v2 (version 2.x)
2. THE CDK_Project SHALL contain a single Stack defining S3_Bucket, CloudFront_Distribution, and EC2_Instance resources
3. THE CDK_Project SHALL include a package.json with dependencies for `aws-cdk-lib`, `constructs`, and devDependencies for `typescript` and `ts-node`
4. THE CDK_Project SHALL include a cdk.json configuration file with the `app` field set to a `ts-node` execution command referencing the entry point file in the `bin/` directory
5. THE CDK_Project SHALL include a tsconfig.json with `strict` set to `true` in compilerOptions
6. WHEN `npx tsc --noEmit` is executed, THE CDK_Project SHALL complete TypeScript compilation with zero errors
7. WHEN `cdk synth` is executed, THE CDK_Project SHALL generate a valid CloudFormation template without synthesis errors
8. THE CDK_Project SHALL organize source files with the CDK app entry point in a `bin/` directory and the Stack definition in a `lib/` directory

### 要件2: S3バケット構成と意図的障害パターン

**ユーザーストーリー:** テスト担当者として、S3バケットに関するCDK初心者が陥りやすい設定ミスが仕込まれたコードが欲しい。これにより、DevOps Agentの検出能力を検証できる。

#### 受入条件

1. THE Stack SHALL define an S3_Bucket with the `websiteIndexDocument` property set to `index.html`, indicating intent to host static website content
2. THE Stack SHALL define a CloudFront Distribution that references the S3_Bucket as its origin, without configuring OAC (OriginAccessControl) or OAI (OriginAccessIdentity) (Fault_Pattern: アクセス拒否)
3. THE S3_Bucket SHALL have the `blockPublicAccess` property set to `BlockPublicAccess.BLOCK_ALL`, which conflicts with the CloudFront Distribution origin configuration defined in criterion 2 (Fault_Pattern: アクセス拒否)
4. THE S3_Bucket SHALL omit the `removalPolicy` property, causing the default RETAIN behavior that leads to stack deletion failures (Fault_Pattern: スタック削除失敗)
5. THE S3_Bucket SHALL omit the `autoDeleteObjects` property, so that when a developer corrects `removalPolicy` to `DESTROY` without adding `autoDeleteObjects: true`, the stack fails to delete a non-empty bucket (Fault_Pattern: バケット削除時の非空エラー). Both criteria 4 and 5 SHALL coexist in the same stack definition file as independent fault patterns.
6. THE Stack SHALL define a bucket policy that references a hardcoded AWS account ID using a 12-digit placeholder value (e.g., `123456789012`) instead of using `Stack.of(this).account` (Fault_Pattern: 環境依存のハードコード)

### 要件3: CloudFront構成と意図的障害パターン

**ユーザーストーリー:** テスト担当者として、CloudFrontに関するCDK初心者が陥りやすい設定ミスが仕込まれたコードが欲しい。これにより、DevOps Agentの検出能力を検証できる。

#### 受入条件

1. THE Stack SHALL define a CloudFront_Distribution using the `Distribution` construct with the S3_Bucket as the origin
2. THE CloudFront_Distribution SHALL use `HttpOrigin` でS3バケットのウェブサイトエンドポイントを指定することで、OAI/OACなしのオリジン構成とする (Fault_Pattern: S3オリジンアクセス不可 — BlockPublicAccessによりHTTPオリジン経由のアクセスが拒否される)
3. THE CloudFront_Distribution SHALL omit the `defaultRootObject` property (Fault_Pattern: ルートURLアクセス時の403エラー)
4. THE CloudFront_Distribution SHALL configure a custom error response for HTTP 403 and HTTP 404 errors that returns HTTP 200 with `responsePagePath` set to a non-existent path `/index.html` (Fault_Pattern: エラーハンドリング不適切 — エラーが隠蔽され、存在しないページを返却するため実際のエラー原因が特定困難になる)
5. THE CloudFront_Distribution SHALL use `ViewerProtocolPolicy.ALLOW_ALL` instead of `REDIRECT_TO_HTTPS` (Fault_Pattern: セキュリティベストプラクティス違反)
6. IF `cdk synth` is executed, THEN THE Stack SHALL generate a valid CloudFormation template containing the CloudFront_Distribution resource with all specified Fault_Patterns without synthesis errors

### 要件4: EC2インスタンス構成と意図的障害パターン

**ユーザーストーリー:** テスト担当者として、EC2に関するCDK初心者が陥りやすい設定ミスが仕込まれたコードが欲しい。これにより、DevOps Agentの検出能力を検証できる。

#### 受入条件

1. THE Stack SHALL define a VPC and an EC2_Instance of type `t2.micro` running Amazon Linux 2023
2. THE Security_Group SHALL allow inbound SSH (port 22) from `0.0.0.0/0` (Fault_Pattern: 過度に開放されたSSHアクセス)
3. THE Security_Group SHALL allow all outbound traffic to `0.0.0.0/0` on all ports (Fault_Pattern: アウトバウンド制限なし)
4. THE Security_Group SHALL be explicitly associated with the EC2_Instance
5. THE EC2_Instance SHALL use a hardcoded AMI ID (e.g., `ami-0abcdef1234567890`) instead of `MachineImage.latestAmazonLinux2023()` (Fault_Pattern: リージョン・時間依存のAMI指定)
6. THE EC2_Instance SHALL be placed in a public subnet without an Elastic IP (Fault_Pattern: 再起動時のIPアドレス変更)
7. THE EC2_Instance SHALL omit IAM instance profile configuration while the UserData script contains at least one AWS CLI command (e.g., `aws s3 ls`) (Fault_Pattern: IAMロール未付与)

### 要件5: CI/CDパイプライン連携

**ユーザーストーリー:** DevOps運用者として、GitHub ActionsによるCI/CDパイプラインが構成されていてほしい。これにより、AWS DevOps Agentがパイプラインの障害を検出・調査できる。

#### 受入条件

1. THE CDK_Project SHALL include a GitHub Actions workflow file at `.github/workflows/deploy.yml` that triggers on push to the `main` branch
2. THE CI_CD_Pipeline SHALL execute `cdk synth` as a validation step, and IF `cdk synth` fails, THEN THE CI_CD_Pipeline SHALL terminate the workflow run without executing subsequent steps
3. THE CI_CD_Pipeline SHALL execute `cdk diff` to show infrastructure changes after `cdk synth` succeeds and before `cdk deploy` executes
4. THE CI_CD_Pipeline SHALL execute `cdk deploy` with `--require-approval never` for automated deployment
5. WHEN the CI_CD_Pipeline fails, THE CI_CD_Pipeline SHALL retain the workflow execution logs for a minimum of 30 days so that THE DevOps_Agent can retrieve the failure step name, exit code, and command output through the GitHub connection
6. THE CI_CD_Pipeline SHALL configure AWS credentials using GitHub OIDC provider instead of long-lived access keys
7. THE CI_CD_Pipeline SHALL install Node.js and CDK dependencies before executing any CDK commands

### 要件6: DevOps Agent検出可能性

**ユーザーストーリー:** テスト担当者として、仕込まれた全ての障害パターンがDevOps Agentにより検出・診断可能であることを確認したい。これにより、DevOps Agentの障害調査能力を体系的に評価できる。

#### 受入条件

1. WHEN a Fault_Pattern causes a deployment failure (cdk synth or cdk deploy fails), THE DevOps_Agent SHALL output a diagnosis that names the specific Fault_Pattern and references the corresponding CDK source file and construct
2. WHEN a Fault_Pattern causes a runtime error (such as S3 access denied or EC2 connectivity failure), THE DevOps_Agent SHALL output a diagnosis that identifies the misconfigured CDK property and the affected resource logical ID
3. THE CDK_Project SHALL include a README documenting all intentional Fault_Patterns (minimum 11 patterns from requirements 2-4) with each entry containing: pattern name, fault category (deployment failure / runtime error / security risk / best practice violation), expected observable symptom, and the expected DevOps_Agent diagnosis summary
4. WHEN the DevOps_Agent investigates a failure, THE CDK_Project SHALL maintain a one-to-one mapping between CloudFormation logical IDs and CDK construct variable names, and SHALL use CDK construct IDs that match the Fault_Pattern names defined in the README
5. THE CDK_Project SHALL include `"@aws-cdk/core:enableStackTrace": true` and `"@aws-cdk/core:pathMetadata": true` in `cdk.json` context values to enable CDK metadata and stack trace information in synthesized templates
6. WHEN a Fault_Pattern is categorized as a security risk or best practice violation (not causing deployment or runtime failure), THE CDK_Project README SHALL document the specific CloudFormation resource property and its non-compliant value that the DevOps_Agent is expected to flag

### 要件7: 障害パターンのドキュメンテーション

**ユーザーストーリー:** CDK Conference参加者として、各障害パターンの説明と学習ポイントが文書化されていてほしい。これにより、教育目的でプロジェクトを活用できる。

#### 受入条件

1. THE CDK_Project SHALL include a `docs/fault-patterns.md` file describing all 13 intentional Fault_Patterns defined in requirements 2-4, written in Japanese
2. WHEN a Fault_Pattern is documented, THE documentation SHALL include the pattern name, affected resource, symptom, root cause, and recommended fix
3. THE documentation SHALL categorize Fault_Patterns into severity levels: Critical (deployment fails), High (runtime errors), Medium (security risks), Low (best practice violations)
4. THE documentation SHALL include a mapping table showing which Fault_Pattern corresponds to which CDK source code file path and construct identifier
5. WHEN a Fault_Pattern is documented, THE documentation SHALL include a difficulty level (初級/中級/上級) and a learning objective describing what CDK concept the pattern teaches
