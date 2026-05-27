empezar logeandose

```bash
aws login
```

---

# DEFINICIÓN DE INFRASTRUCTURA

Este documento cubre:

- VPC + subnets públicas y privadas (2 AZ)
- Security Groups sg-api y sg-db
- RDS PostgreSQL t3.micro (subnet privada)
- ECR repository con lifecycle policy
- ECS Cluster + EC2 t2.micro + IAM Role
- SQS sales-notifications + DLQ + CloudWatch alarm
- S3 bucket + CloudFront distribution con OAC
- API Gateway HTTP API + VPC Link + NLB
- SSM Parameter Store (7 parámetros)
- IAM user para GitHub Actions con permisos mínimos

---

luego copiar todas la variables de entorno de aws.infrastructure.md a la consola

## Crear la VPC

```bash
VPC_ID=$(aws ec2 create-vpc \
  --cidr-block 10.0.0.0/16 \
  --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=event-platform-vpc},{Key=Project,Value=event-platform}]' \
  --query 'Vpc.VpcId' \
  --output text)

echo "VPC_ID: $VPC_ID"
```

## Habilitar DNS resolution y DNS hostnames (requerido por RDS y ECS)

```bash
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
```

## Crear subnets públicas A y B

```bash
# Subnet pública AZ-a
PUBLIC_SUBNET_A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.1.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=event-platform-public-a},{Key=Type,Value=public}]' \
  --query 'Subnet.SubnetId' \
  --output text)

# Subnet pública AZ-b
PUBLIC_SUBNET_B=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.2.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=event-platform-public-b},{Key=Type,Value=public}]' \
  --query 'Subnet.SubnetId' \
  --output text)
```

## Crear Subnets privadas A y B

```bash
# Subnet privada AZ-a
PRIVATE_SUBNET_A=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.3.0/24 \
  --availability-zone us-east-1a \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=event-platform-private-a},{Key=Type,Value=private}]' \
  --query 'Subnet.SubnetId' \
  --output text)

# Subnet privada AZ-b
PRIVATE_SUBNET_B=$(aws ec2 create-subnet \
  --vpc-id $VPC_ID \
  --cidr-block 10.0.4.0/24 \
  --availability-zone us-east-1b \
  --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=event-platform-private-b},{Key=Type,Value=private}]' \
  --query 'Subnet.SubnetId' \
  --output text)
```

## Crear Internet Gateway para las Subnets Públicas

Las subnets públicas necesitan un IGW para tener acceso a internet

```bash
IGW_ID=$(aws ec2 create-internet-gateway \
  --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=event-platform-igw}]' \
  --query 'InternetGateway.InternetGatewayId' \
  --output text)

  # Asociarlo a la VPC
aws ec2 attach-internet-gateway \
  --internet-gateway-id $IGW_ID \
  --vpc-id $VPC_ID
```

## Route Tables

Route table pública, dirige el tráfico saliente al IGW

```bash
PUBLIC_RT=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=event-platform-public-rt}]' \
  --query 'RouteTable.RouteTableId' \
  --output text)

# Ruta default hacia internet
  aws ec2 create-route \
  --route-table-id $PUBLIC_RT \
  --destination-cidr-block 0.0.0.0/0 \
  --gateway-id $IGW_ID

  # Asociar las dos subnets públicas
aws ec2 associate-route-table --route-table-id $PUBLIC_RT --subnet-id $PUBLIC_SUBNET_A
aws ec2 associate-route-table --route-table-id $PUBLIC_RT --subnet-id $PUBLIC_SUBNET_B

```

## Creación de Route Table privada

Las subnets privadas sólo hablan dentro de la VPC

```bash
PRIVATE_RT=$(aws ec2 create-route-table \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=event-platform-private-rt}]' \
  --query 'RouteTable.RouteTableId' \
  --output text)

aws ec2 associate-route-table --route-table-id $PRIVATE_RT --subnet-id $PRIVATE_SUBNET_A
aws ec2 associate-route-table --route-table-id $PRIVATE_RT --subnet-id $PRIVATE_SUBNET_B
```

## Habilitar Auto Assign de Ip Pública en subnets públicas

Necesario para que la instancia de EC2 reciba una ip pública al lanzarse

```bash
aws ec2 modify-subnet-attribute \
  --subnet-id $PUBLIC_SUBNET_A \
  --map-public-ip-on-launch

aws ec2 modify-subnet-attribute \
  --subnet-id $PUBLIC_SUBNET_B \
  --map-public-ip-on-launch
```

**Importante**
Los ids generados se han guardado en el archivo: infra/aws-resources.env

## Verificaciones finales

Podemos usar los comandos describe-vpcs y describe-subnets para validar que todo esta correcto

```bash
aws ec2 describe-vpcs \
  --filters "Name=tag:Name,Values=event-platform-vpc" \
  --query 'Vpcs[0].{ID:VpcId,CIDR:CidrBlock,State:State}' \
  --output table

aws ec2 describe-subnets \
  --filters "Name=vpc-id,Values=$VPC_ID" \
  --query 'Subnets[*].{Name:Tags[?Key==`Name`]|[0].Value,ID:SubnetId,CIDR:CidrBlock,AZ:AvailabilityZone,Public:MapPublicIpOnLaunch}' \
  --output table
```

---

# Creación de Security Groups

## Security Group de la API

SG de la instancia EC2 que corre el backend.  
Permite tráfico HTTP en el puerto 3000 desde cualquier origen.  
API Gw actúa como proxy, así que el tráfico llega desde ips de AWS) y permite SSH para administración.

```bash
SG_API=$(aws ec2 create-security-group \
  --group-name sg_api \
  --description "Security group para api de NestJS en instancia EC2" \
  --vpc-id $VPC_ID \
  --tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=sg-api},{Key=Project,Value=event-platform}]' \
  --query 'GroupId' \
  --output text)
```

Reglas de Entrada:

```bash
# Puerto 3000 — tráfico HTTP desde API Gateway (cualquier IP dentro de la VPC)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_API \
  --protocol tcp \
  --port 3000 \
  --cidr 0.0.0.0/0
```

Para habilitar el ingreso por el puerto 22 (SSH), necesitamos al menos conocer cual es mi IP pública. Esto podemos saberlo con la herramienta:

```bash
curl -s https://checkip.amazonaws.com
```

Lo asociamos a una variable de entorno así:

```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)
```

En conjunto, habilitamos el SSH a mi ip actual de esta forma:

```bash
MY_IP=$(curl -s https://checkip.amazonaws.com)
aws ec2 authorize-security-group-ingress \
  --group-id $SG_API \
  --protocol tcp \
  --port 22 \
  --cidr ${MY_IP}/32
```

# Security Group de la BD

El SG para la instancia de RDS, sólo acepta conexiones en el puerto 5432 desde instancias que tengan el security group de la API asignados (sg-api), **nunca desde internet**

```bash
SG_DB=$(aws ec2 create-security-group \
--group-name sg_db \
--description "Security group for RDS PostgreSQL - only accessible from sg-api" \
--vpc-id $VPC_ID \
--tag-specifications 'ResourceType=security-group,Tags=[{Key=Name,Value=sg-db},{Key=Project,Value=event-platform}]' \
--query 'GroupId' \
--output text)

```

Agregar la regla de entrada (ingress) referenciando **sg-api** como fuente, no un CIDR, mediante el **source-group**

```bash
aws ec2 authorize-security-group-ingress \
  --group-id $SG_DB \
  --protocol tcp \
  --port 5432 \
  --source-group $SG_API
```

## Verificación

Confirmar las security groups de API y DB

```bash
aws ec2 describe-security-groups \
  --group-ids $SG_API $SG_DB \
  --query 'SecurityGroups[*].{Name:GroupName,ID:GroupId,Rules:IpPermissions}' \
  --output table
```

```bash
aws ec2 describe-security-groups \
  --group-ids $SG_DB \
  --query 'SecurityGroups[0].IpPermissions' \
  --output json
```

---

# Creación de la Instancia de Postgresql con RDS en vm t3.micro

## Crear el Subnet Group de RDS

RDS necesita un DB Subnet Group que le indique donde puede comunicarse, debe incluir al menos 2 Availability Zones, aunque sea una sola instancia.

```bash
aws rds create-db-subnet-group \
  --db-subnet-group-name event-platform-db-subnet-group \
  --db-subnet-group-description "Private subnets for event-platform RDS" \
  --subnet-ids $PRIVATE_SUBNET_A $PRIVATE_SUBNET_B \
  --tags Key=Name,Value=event-platform-db-subnet-group Key=Project,Value=event-platform
```

## Verificación

```bash
aws rds describe-db-subnet-groups \
  --db-subnet-group-name event-platform-db-subnet-group \
  --query 'DBSubnetGroups[0].{Name:DBSubnetGroupName,Status:SubnetGroupStatus,Subnets:Subnets[*].SubnetIdentifier}' \
  --output json
```

## Crear la instancia de RDS

```bash
read -s DB_PASSWORD
aws rds create-db-instance \
  --db-instance-identifier event-platform-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --engine-version 15.17 \
  --master-username eventadmin \
  --master-user-password $DB_PASSWORD \
  --db-name eventplatform \
  --allocated-storage 20 \
  --storage-type gp2 \
  --no-multi-az \
  --no-publicly-accessible \
  --db-subnet-group-name event-platform-db-subnet-group \
  --vpc-security-group-ids $SG_DB \
  --backup-retention-period 7 \
  --preferred-backup-window "03:00-04:00" \
  --preferred-maintenance-window "mon:04:00-mon:05:00" \
  --no-deletion-protection \
  --tags Key=Name,Value=event-platform-db Key=Project,Value=event-platform
```

Para monitorear el deployment

```bash
watch -n 15 "aws rds describe-db-instances \
  --db-instance-identifier event-platform-db \
  --query 'DBInstances[0].{Status:DBInstanceStatus,Endpoint:Endpoint.Address}' \
  --output table"
```

## Obtener el endpoint y guardarlo

Adelantando a la configuracíon de Prisma, armaremos el DATABASE_URL

```bash
DB_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier event-platform-db \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)

DATABASE_URL="postgresql://eventadmin:${DB_PASSWORD}@${DB_ENDPOINT}:5432/eventplatform"
```

El DATABASE_URL se ha guardado en el archivo .secrets.env (gitignorado)

## Verificación

```bash
aws rds describe-db-instances \
  --db-instance-identifier event-platform-db \
  --query 'DBInstances[0].{
    Status:DBInstanceStatus,
    Class:DBInstanceClass,
    Engine:Engine,
    EngineVersion:EngineVersion,
    Endpoint:Endpoint.Address,
    Port:Endpoint.Port,
    PubliclyAccessible:PubliclyAccessible,
    MultiAZ:MultiAZ,
    Storage:AllocatedStorage
  }' \
  --output table
```

---

# Crear el Repositorio de ECR

```bash
ECR_REPO_URI=$(aws ecr create-repository \
  --repository-name event-platform-api \
  --image-scanning-configuration scanOnPush=true \
  --image-tag-mutability MUTABLE \
  --tags Key=Name,Value=event-platform-api Key=Project,Value=event-platform \
  --query 'repository.repositoryUri' \
  --output text)
```

## Política de Retención

Para mantenernos dentro de free tier de ECR, necesitamos reducir la cantidad de imágenes retenidas (o superar el límite de 500 mb bien rápido)

```bash
aws ecr put-lifecycle-policy \
  --repository-name event-platform-api \
  --lifecycle-policy-text '{
    "rules": [
      {
        "rulePriority": 1,
        "description": "Retiene solamente las últimas 5 imágenes",
        "selection": {
          "tagStatus": "any",
          "countType": "imageCountMoreThan",
          "countNumber": 5
        },
        "action": {
          "type": "expire"
        }
      }
    ]
  }'
```

## Obtener el Account Id y la Región

Se me había pasado obtener estas credenciales, que son útiles para construir el URI completo de la imagen en Dockerfile y en la GH action.

```bash
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query 'Account' --output text)
AWS_REGION=$(aws configure get region)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
```

Para ver los valores

```bash
echo "AWS_ACCOUNT_ID: $AWS_ACCOUNT_ID"
echo "AWS_REGION: $AWS_REGION"
echo "ECR_REGISTRY: $ECR_REGISTRY"
echo "ECR_REPO_URI: $ECR_REPO_URI"
```

## Verificación del login en ECR

Si funciona acá, funciona en el github action

```bash

```

## Verificacion del repository

```bash
aws ecr describe-repositories \
  --repository-names event-platform-api \
  --query 'repositories[0].{
    Name:repositoryName,
    URI:repositoryUri,
    ScanOnPush:imageScanningConfiguration.scanOnPush,
    TagMutability:imageTagMutability,
    CreatedAt:createdAt
  }' \
  --output table
```

## Verificacion de la policy

```bash
aws ecr get-lifecycle-policy \
  --repository-name event-platform-api \
  --query 'lifecyclePolicyText' \
  --output text
```

---

# Crear el Cluster de ECS

```bash
ECS_CLUSTER=$(aws ecs create-cluster \
--cluster-name event-platform-cluster \
--tags key=Name,value=event-platform-cluster key=Project,value=event-platform \
--query 'cluster.clusterArn' \
--output text)
```

# Es necesario crear un role de IAM para la instancia de EC2

La instancia de EC2 necesita un rol de IAM que le permita registrarse en ECS, hacer pull de imágenes desde ECR, leer secretos de SSM y escribir logs en Cloudwatch.

```bash
aws iam create-role \
--role-name event-platform-ec2-role \
--assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "ec2.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}' \
--tags Key=Project,Value=event-platform
```

## Política: Registro en ECS y recibir tareas

```bash
aws iam attach-role-policy \
--role-name event-platform-ec2-role \
--policy-arn arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role
```

## Política: Leer parámetros de SSM Parameter Store

```bash
aws iam attach-role-policy \
  --role-name event-platform-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess
```

## Politica: Escribir logs en Cloudwatch

```bash
aws iam attach-role-policy \
  --role-name event-platform-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/CloudWatchLogsFullAccess
```

## Politica: Hacer Pull/Push a ECR

```bash
aws iam attach-role-policy \
  --role-name event-platform-ec2-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly
```

## Instance Profile: Crear el wrapper que asocia el Role a la instancia de EC2

```bash
aws iam create-instance-profile \
  --instance-profile-name event-platform-ec2-profile

aws iam add-role-to-instance-profile \
  --instance-profile-name event-platform-ec2-profile \
  --role-name event-platform-ec2-role
```

## Obtener la AMI de ECS Optimizada Amazon Linux 2

Usaremos la AMI oficial optimizada para ECS ya que ya trae el agente preinstalado.

```bash
ECS_AMI=$(aws ssm get-parameters \
  --names /aws/service/ecs/optimized-ami/amazon-linux-2/recommended/image_id \
  --query 'Parameters[0].Value' \
  --output text)
```

## Adicional: Crearemos el key-pair para SSH

En caso necesite ingresar a la instancia para debuggear algo.

```bash
aws ec2 create-key-pair \
--key-name event-platform-key \
--query 'KeyMaterial' \
--output text > infra/event-platform-key.pem

chmod 400 infra/event-platform-key.pem

echo "infra/event-platform-key.pem" >> .gitignore
```

## USER DATA script

Este script se ejecuta automáticamente cuando la instancia EC2 arranca. Le indica al agente ECS a qué cluster debe registrarse:

```bash
cat > /tmp/ecs-userdata.sh << 'EOF'
#!/bin/bash
echo ECS_CLUSTER=event-platform-cluster >> /etc/ecs/ecs.config
echo ECS_ENABLE_CONTAINER_METADATA=true >> /etc/ecs/ecs.config
echo ECS_ENABLE_TASK_IAM_ROLE=true >> /etc/ecs/ecs.config
EOF
```

## Lanzar la Instancia de EC2

```bash
EC2_INSTANCE_ID=$(aws ec2 run-instances \
  --image-id $ECS_AMI \
  --instance-type t2.micro \
  --key-name event-platform-key \
  --security-group-ids $SG_API \
  --subnet-id $PUBLIC_SUBNET_A \
  --iam-instance-profile Name=event-platform-ec2-profile \
  --user-data file:///tmp/ecs-userdata.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=event-platform-ec2},{Key=Project,Value=event-platform}]' \
  --query 'Instances[0].InstanceId' \
  --output text)
```

## Obtener la instancia pública de la instancia:

```bash
EC2_PUBLIC_IP=$(aws ec2 describe-instances \
  --instance-ids $EC2_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].PublicIpAddress' \
  --output text)
```

## Verificar que la instancia se registró en el cluster

Puede tardar más de 2 minutos

```bash
aws ecs list-container-instances \
  --cluster event-platform-cluster \
  --query 'containerInstanceArns' \
  --output table
```

## Verificar los recursos disponibles en el cluster:

```bash
aws ecs describe-clusters \
  --clusters event-platform-cluster \
  --query 'clusters[0].{
    Name:clusterName,
    Status:status,
    RegisteredInstances:registeredContainerInstancesCount,
    RunningTasks:runningTasksCount,
    PendingTasks:pendingTasksCount
  }' \
  --output table
```

## Creación de Log Groups en Cloudwatch

Adelantando un poco la creación de loggroups

```bash
aws logs create-log-group \
  --log-group-name /ecs/event-platform-api \
  --tags Project=event-platform
```

## Retención de 30 días

Dado que la free tier sólo cubre 5Gb de ingreso a mes, es mejor mantener corto la retención

```bash
aws logs put-retention-policy \
  --log-group-name /ecs/event-platform-api \
  --retention-in-days 30
```

**Importante**: Los ids de los recursos se han almacenado en el archivo infra/aws-resources.env

## Verificacion

```bash
aws ec2 describe-instances \
  --instance-ids $EC2_INSTANCE_ID \
  --query 'Reservations[0].Instances[0].{
    ID:InstanceId,
    Type:InstanceType,
    State:State.Name,
    PublicIP:PublicIpAddress,
    AMI:ImageId,
    IAMProfile:IamInstanceProfile.Arn
  }' \
  --output table
```

# Creación de Cola SQS para notificaciones de ventas

## Crear la DLQ

La dlq debe existir antes que la cola principal ya que necesita su ARN al crearse.

```bash
DLQ_URL=$(aws sqs create-queue \
  --queue-name sales-notifications-dlq \
  --attributes MessageRetentionPeriod=1209600 \
  --tags '{"Project":"event-platform","Name":"sales-notifications-dlq"}' \
  --query 'QueueUrl' \
  --output text)

```

## Obtener el ARN de la DLQ:

```bash
DLQ_ARN=$(aws sqs get-queue-attributes \
--queue-url $DLQ_URL \
--attribute-names QueueArn \
--query 'Attributes.QueueArn' \
--output text)
```

## Creación de la Cola principal:

```bash
SQS_QUEUE_URL=$(aws sqs create-queue \
--queue-name sales-notifications \
--attributes "{
  \"VisibilityTimeout\": \"60\",
  \"MessageRetentionPeriod\": \"345600\",
  \"ReceiveMessageWaitTimeSeconds\": \"20\",
  \"RedrivePolicy\": \"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"
}" \
--query 'QueueUrl' \
--output text)
```

## Obtener el ARN de la cola principal:

```bash
SQS_QUEUE_ARN=$(aws sqs get-queue-attributes \
--queue-url $SQS_QUEUE_URL \
--attribute-names QueueArn \
--query 'Attributes.QueueArn' \
--output text)

```

## Crear alarma en Cloudwatch para la DLQ

Cuando un mensaje llegue a la dlq significa que el worker falló 3 veces seguidas procesándolo.  
 Esta alarma lo hace visible en Cloudwatch.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name "event-platform-dlq-not-empty" \
  --alarm-description "Mensaje llegó a la cola sales-notifications-dlq después de 3 intentos fallidos" \
  --metric-name "ApproximateNumberOfMessagesVisible" \
  --namespace "AWS/SQS" \
  --statistic Sum \
  --period 60 \
  --threshold 1 \
  --comparison-operator GreaterThanOrEqualToThreshold \
  --evaluation-periods 1 \
  --dimensions Name=QueueName,Value=sales-notifications-dlq \
  --alarm-actions [] \
  --treat-missing-data notBreaching
```

## Agregar permisos SQS al IAM Role de EC2

La instancia EC2 necesita permisos para que el worker pueda publicar y consumir mensajes.

```bash
aws iam put-role-policy \
  --role-name event-platform-ec2-role \
  --policy-name event-platform-sqs-policy \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Effect\": \"Allow\",
        \"Action\": [
          \"sqs:SendMessage\",
          \"sqs:ReceiveMessage\",
          \"sqs:DeleteMessage\",
          \"sqs:GetQueueAttributes\",
          \"sqs:GetQueueUrl\"
        ],
        \"Resource\": [
          \"${SQS_QUEUE_ARN}\",
          \"${DLQ_ARN}\"
        ]
      }
    ]
  }"
```

**Importante**: Se han guardado los url y arn en el archivo de recursos:

## Verificacion de Cola Principal

```bash
aws sqs get-queue-attributes \
--queue-url $SQS_QUEUE_URL \
--attribute-names All \
--query 'Attributes.{
  ARN:QueueArn,
  VisibilityTimeout:VisibilityTimeout,
  RetentionPeriod:MessageRetentionPeriod,
  LongPolling:ReceiveMessageWaitTimeSeconds,
  RedrivePolicy:RedrivePolicy
}' \
--output table
```

## Verificacion de la DLQ

```bash
aws sqs get-queue-attributes \
--queue-url $DLQ_URL \
--attribute-names QueueArn MessageRetentionPeriod \
--output table
```

---

# Creación del Bucket

```bash
S3_BUCKET="event-platform-frontend-${AWS_ACCOUNT_ID}"
aws s3api create-bucket \
--bucket $S3_BUCKET \
--region $AWS_REGION

```

## Bloquear acceso público al bucket

El bucket no debe ser accesible directamente desde internet — solo a través de CloudFront

```bash

```

## Crear la distribución CloudFront con Origin Access Control

CloudFront necesita un Origin Access Control (OAC) para poder leer del bucket privado.

```bash
OAC_ID=$(aws cloudfront create-origin-access-control \
 --origin-access-control-config '{
   "Name": "event-platform-oac",
   "Description": "OAC for event-platform frontend bucket",
   "SigningProtocol": "sigv4",
   "SigningBehavior": "always",
   "OriginAccessControlOriginType": "s3"
 }' \
 --query 'OriginAccessControl.Id' \
 --output text)
```

## Creación del Cloud Front Distribution

```bash
CF_DISTRIBUTION=$(aws cloudfront create-distribution \
  --distribution-config "{
    \"CallerReference\": \"event-platform-$(date +%s)\",
    \"Comment\": \"event-platform frontend\",
    \"Enabled\": true,
    \"DefaultRootObject\": \"index.html\",
    \"Origins\": {
      \"Quantity\": 1,
      \"Items\": [
        {
          \"Id\": \"s3-event-platform-frontend\",
          \"DomainName\": \"${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com\",
          \"S3OriginConfig\": {\"OriginAccessIdentity\": \"\"},
          \"OriginAccessControlId\": \"${OAC_ID}\"
        }
      ]
    },
    \"DefaultCacheBehavior\": {
      \"TargetOriginId\": \"s3-event-platform-frontend\",
      \"ViewerProtocolPolicy\": \"redirect-to-https\",
      \"CachePolicyId\": \"658327ea-f89d-4fab-a63d-7e88639e58f6\",
      \"AllowedMethods\": {
        \"Quantity\": 2,
        \"Items\": [\"GET\", \"HEAD\"]
      }
    },
    \"CustomErrorResponses\": {
      \"Quantity\": 2,
      \"Items\": [
        {
          \"ErrorCode\": 403,
          \"ResponsePagePath\": \"/index.html\",
          \"ResponseCode\": \"200\",
          \"ErrorCachingMinTTL\": 0
        },
        {
          \"ErrorCode\": 404,
          \"ResponsePagePath\": \"/index.html\",
          \"ResponseCode\": \"200\",
          \"ErrorCachingMinTTL\": 0
        }
      ]
    },
    \"PriceClass\": \"PriceClass_100\"
  }" \
  --query '{ID:Distribution.Id,Domain:Distribution.DomainName,ARN:Distribution.ARN}' \
  --output json)

```

## Agregar Policy para permitir acceso desde CloudFront

El bucket necesita una policy explícita que autorice a CloudFront a leer desde S3

```bash
aws s3api put-bucket-policy \
  --bucket $S3_BUCKET \
  --policy "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [
      {
        \"Sid\": \"AllowCloudFrontOAC\",
        \"Effect\": \"Allow\",
        \"Principal\": {
          \"Service\": \"cloudfront.amazonaws.com\"
        },
        \"Action\": \"s3:GetObject\",
        \"Resource\": \"arn:aws:s3:::${S3_BUCKET}/*\",
        \"Condition\": {
          \"StringEquals\": {
            \"AWS:SourceArn\": \"${CF_ARN}\"
          }
        }
      }
    ]
  }"
```

## Verificación

```bash
aws s3api get-public-access-block --bucket $S3_BUCKET --output table
```

Verificar la distribución de Cloud Front:

```bash
aws cloudfront get-distribution \
  --id $CF_DISTRIBUTION_ID \
  --query 'Distribution.{
    ID:Id,
    Domain:DomainName,
    Status:Status,
    Enabled:DistributionConfig.Enabled,
    DefaultRoot:DistributionConfig.DefaultRootObject
  }' \
  --output table
```

```bash
watch -n 30 "aws cloudfront get-distribution \
  --id $CF_DISTRIBUTION_ID \
  --query 'Distribution.Status' \
  --output text"
```

---

# Creación del API Gateway, HTTP API y VPC Link

## Crear el Target Group para el NLB

Define a donde se envia el trafico, la instancia de EC2 en el puerto 3000

```bash
TG_ARN=$(aws elbv2 create-target-group \
  --name event-platform-tg \
  --protocol TCP \
  --port 3000 \
  --vpc-id $VPC_ID \
  --target-type instance \
  --health-check-protocol TCP \
  --health-check-port 3000 \
  --health-check-interval-seconds 30 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --tags Key=Project,Value=event-platform \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)
```

Registra la instancia EC2 en el Target Group:

```bash
aws elbv2 register-targets \
--target-group-arn $TG_ARN \
--targets Id=$EC2_INSTANCE_ID,Port=3000
```

Crear el Network Load Balancer interno:

```bash
NLB_ARN=$(aws elbv2 create-load-balancer \
--name event-platform-nlb \
--type network \
--scheme internal \
--subnets $PUBLIC_SUBNET_A $PUBLIC_SUBNET_B \
--tags Key=Name,Value=event-platform-nlb Key=Project,Value=event-platform \
--query 'LoadBalancers[0].LoadBalancerArn' \
--output text)
```

Crear el listener en el NLB que reenvia trafico al Target Group

```bash
aws elbv2 create-listener \
--load-balancer-arn $NLB_ARN \
--protocol TCP \
--port 3000 \
--default-actions Type=forward,TargetGroupArn=$TG_ARN

aws elbv2 wait load-balancer-available \
--load-balancer-arns $NLB_ARN
```

## Crear el VPC link

Para conectar el API Gateway con el NLB dentro de la VPC

```bash
VPC_LINK_ID=$(aws apigatewayv2 create-vpc-link \
  --name event-platform-vpc-link \
  --subnet-ids $PUBLIC_SUBNET_A $PUBLIC_SUBNET_B \
  --security-group-ids $SG_API \
  --tags Project=event-platform \
  --query 'VpcLinkId' \
  --output text)
```

Nota: usualmente tarda 5 minutos en cargar y funcionar

```bash
aws apigatewayv2 get-vpc-link \
--vpc-link-id $VPC_LINK_ID \
--query 'VpcLinkStatus' \
--output text
```

## Crear el API Gateway HTTP API

```bash
API_ID=$(aws apigatewayv2 create-api \
--name event-platform-api \
--protocol-type HTTP \
--cors-configuration '{
  "AllowOrigins": ["*"],
  "AllowMethods": ["GET","POST","OPTIONS"],
  "AllowHeaders": ["Content-Type","Authorization"],
  "MaxAge": 300
}' \
--tags Project=event-platform \
--query 'ApiId' \
--output text)
```

## Crear integración con el VPC Link:

hay que obtener el DNS del NLB:

```bash
NLB_DNS=$(aws elbv2 describe-load-balancers \
--load-balancer-arns $NLB_ARN \
--query 'LoadBalancers[0].DNSName' \
--output text)
```

Obtener el ARN del Listener:

```bash
LISTENER_ARN=$(aws elbv2 describe-listeners \
--load-balancer-arn $NLB_ARN \
--query 'Listeners[0].ListenerArn' \
--output text)
```

Crear la integración

```bash
INTEGRATION_ID=$(aws apigatewayv2 create-integration \
--api-id $API_ID \
--integration-type HTTP_PROXY \
--integration-method ANY \
--integration-uri $LISTENER_ARN \
--connection-type VPC_LINK \
--connection-id $VPC_LINK_ID \
--payload-format-version 1.0 \
--query 'IntegrationId' \
--output text)
```

Crear la ruta que captura todo el trafico /api

```bash
aws apigatewayv2 create-route \
--api-id $API_ID \
--route-key 'ANY /api/{proxy+}' \
--target "integrations/${INTEGRATION_ID}"
```

Crear el stage de prod y habilitar throttling

```bash
aws apigatewayv2 create-stage \
  --api-id $API_ID \
  --stage-name prod \
  --auto-deploy \
  --default-route-settings '{
    "ThrottlingBurstLimit": 50,
    "ThrottlingRateLimit": 100
  }' \
  --tags Project=event-platform

```

Obtener la URL final del API Gateway:

```bash
API_URL="https://${API_ID}.execute-api.${AWS_REGION}.amazonaws.com/prod"
echo "API_URL: $API_URL"
```

Verificacion del API Gateway y sus rutas

```bash
aws apigatewayv2 get-routes \
  --api-id $API_ID \
  --query 'Items[*].{Route:RouteKey,Target:Target}' \
  --output table
```

Verificacion del health del target group

```bash
aws elbv2 describe-target-health \
--target-group-arn $TG_ARN \
--query 'TargetHealthDescriptions[*].{
  Target:Target.Id,
  Port:Target.Port,
  Health:TargetHealth.State,
  Reason:TargetHealth.Reason
}' \
--output table
```

# Agreagar los Secrets en SSM Parameters

## Guardar URL de la Base de Datos

SecureString que KMS encripta

```bash
aws ssm put-parameter \
--name "/event-platform/prod/DATABASE_URL" \
--value "$DATABASE_URL" \
--type SecureString \
--description "PostgreSQL connection string for RDS instance" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod
```

**Importante**: El $DATABASE_URL está en el archivo .secrets.env

## Guardar el SQS_QUEUE_URL

```bash
aws ssm put-parameter \
--name "/event-platform/prod/SQS_QUEUE_URL" \
--value "$SQS_QUEUE_URL" \
--type SecureString \
--description "SQS queue URL for sales notifications" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod
```

## Generaremos un JWT_SECRET

Genera un secret criptográficamente seguro directamente en la terminal

```bash
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
echo "JWT_SECRET generado: ${JWT_SECRET:0:20}..." # muestra solo los primeros 20 chars

aws ssm put-parameter \
--name "/event-platform/prod/JWT_SECRET" \
--value "$JWT_SECRET" \
--type SecureString \
--description "JWT signing secret for session tokens" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod
```

## Guardar Parámetros no Sensibles como String

Parámetros centralizarlos en SSM para no hardcodearlos en la Task Definition

```bash
# Capacidad máxima del evento
aws ssm put-parameter \
--name "/event-platform/prod/EVENT_MAX_CAPACITY" \
--value "50" \
--type String \
--description "Maximum attendees for the event" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod

# Nombre del evento
aws ssm put-parameter \
--name "/event-platform/prod/EVENT_NAME" \
--value "Feria de Promociones 2025" \
--type String \
--description "Name of the event displayed in the platform" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod

# Puerto del servidor NestJS
aws ssm put-parameter \
--name "/event-platform/prod/PORT" \
--value "3000" \
--type String \
--description "NestJS server port" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod

# Node environment
aws ssm put-parameter \
--name "/event-platform/prod/NODE_ENV" \
--value "production" \
--type String \
--description "Node environment" \
--tags Key=Project,Value=event-platform Key=Environment,Value=prod
```

Tambien vamos a guardar el JWT_SECRET localmente para desarrollo:

```bash
echo "JWT_SECRET=$JWT_SECRET" >> infra/.secrets.env
```

**Importante:** Los parámetros más importantes para el desarrollo local están en apps/backend/.env.example

## Verificación

Ver lista de parametros en SSM

```bash
aws ssm get-parameters-by-path \
  --path "/event-platform/prod" \
  --query 'Parameters[*].{Name:Name,Type:Type,LastModified:LastModifiedDate}' \
  --output table
```

Verificar los secure String:

```bash
aws ssm get-parameter \
  --name "/event-platform/prod/DATABASE_URL" \
  --with-decryption \
  --query 'Parameter.Value' \
  --output text
```

# Crear el IAM User con permisos mínimos para Github Actions

```bash
cat > infra/github-actions-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ECRAuth",
      "Effect": "Allow",
      "Action": [
        "ecr:GetAuthorizationToken"
      ],
      "Resource": "*"
    },
    {
      "Sid": "ECRPush",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
        "ecr:BatchGetImage",
        "ecr:DescribeImages"
      ],
      "Resource": "arn:aws:ecr:${AWS_REGION}:${AWS_ACCOUNT_ID}:repository/event-platform-api"
    },
    {
      "Sid": "ECSDeployBackend",
      "Effect": "Allow",
      "Action": [
        "ecs:UpdateService",
        "ecs:DescribeServices",
        "ecs:DescribeTaskDefinition",
        "ecs:RegisterTaskDefinition",
        "ecs:RunTask",
        "ecs:DescribeTasks",
        "ecs:ListTasks"
      ],
      "Resource": [
        "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:cluster/event-platform-cluster",
        "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:service/event-platform-cluster/*",
        "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:task-definition/event-platform-api*",
        "arn:aws:ecs:${AWS_REGION}:${AWS_ACCOUNT_ID}:task/*"
      ]
    },
    {
      "Sid": "ECSPassRole",
      "Effect": "Allow",
      "Action": "iam:PassRole",
      "Resource": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/event-platform-ec2-role"
    },
    {
      "Sid": "S3DeployFrontend",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::${S3_BUCKET}",
        "arn:aws:s3:::${S3_BUCKET}/*"
      ]
    },
    {
      "Sid": "CloudFrontInvalidation",
      "Effect": "Allow",
      "Action": [
        "cloudfront:CreateInvalidation"
      ],
      "Resource": "arn:aws:cloudfront::${AWS_ACCOUNT_ID}:distribution/${CF_DISTRIBUTION_ID}"
    },
    {
      "Sid": "SSMReadSecrets",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParameter",
        "ssm:GetParameters",
        "ssm:GetParametersByPath"
      ],
      "Resource": "arn:aws:ssm:${AWS_REGION}:${AWS_ACCOUNT_ID}:parameter/event-platform/*"
    },
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:${AWS_REGION}:${AWS_ACCOUNT_ID}:alias/aws/ssm"
    }
  ]
}
EOF

echo "Archivo de política creado ✓"
```

Ahora Crear política en IAM

```bash
GHA_POLICY_ARN=$(aws iam create-policy \
  --policy-name event-platform-github-actions-policy \
  --description "Minimum permissions for GitHub Actions CI/CD pipeline" \
  --policy-document file://infra/github-actions-policy.json \
  --tags Key=Project,Value=event-platform \
  --query 'Policy.Arn' \
  --output text)
```

Crear el usuario IAM:

```bash
aws iam create-user \
  --user-name event-platform-github-actions \
  --tags Key=Project,Value=event-platform Key=Purpose,Value=CI/CD
```

Adjuntar la política al usuario:

```bash
aws iam attach-user-policy \
  --user-name event-platform-github-actions \
  --policy-arn $GHA_POLICY_ARN
```

Generar los Access Keys

```bash
GHA_CREDENTIALS=$(aws iam create-access-key \
  --user-name event-platform-github-actions \
  --query 'AccessKey.{KeyId:AccessKeyId,Secret:SecretAccessKey}' \
  --output json)

GHA_ACCESS_KEY_ID=$(echo $GHA_CREDENTIALS | python3 -c "import sys,json; print(json.load(sys.stdin)['KeyId'])")
GHA_SECRET_ACCESS_KEY=$(echo $GHA_CREDENTIALS | python3 -c "import sys,json; print(json.load(sys.stdin)['Secret'])")
```

Los siguientes valores deben habilitarse en la consola de GitHub

```
AWS_ACCESS_KEY_ID El GHA_ACCESS_KEY_ID impreso arriba
AWS_SECRET_ACCESS_KEY El valor completo en infra/.secrets.env
AWS_REGION  us-east-1
AWS_ACCOUNT_ID Tu Account ID
ECR_REPO_URI  El URI del repositorio ECR
ECS_CLUSTER event-platform-cluster
S3_BUCKET El nombre del bucket S3
CF_DISTRIBUTION_ID  El ID de la distribución CloudFront
API_URL La URL del API Gateway
```

Guardar en el archivo de recursos:

```bash
cat >> infra/aws-resources.env << EOF
GHA_POLICY_ARN=$GHA_POLICY_ARN
GHA_USER=event-platform-github-actions
EOF
```

## Verificacion

Usuario:

```bash
aws iam get-user \
  --user-name event-platform-github-actions \
  --query 'User.{Name:UserName,ID:UserId,ARN:Arn,Created:CreateDate}' \
  --output table
```

User Policies:

```bash
aws iam list-attached-user-policies \
--user-name event-platform-github-actions \
--query 'AttachedPolicies[*].{Policy:PolicyName,ARN:PolicyArn}' \
--output table
```

```bash
aws iam list-access-keys \
  --user-name event-platform-github-actions \
  --query 'AccessKeyMetadata[*].{KeyId:AccessKeyId,Status:Status,Created:CreateDate}' \
  --output table
```
