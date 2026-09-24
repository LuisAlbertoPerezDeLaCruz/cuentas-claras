# Desplegar Cuentas Claras en AWS

Guía para publicar el sitio. La plantilla crea un bucket S3 **privado** servido a través de
CloudFront: el bucket nunca queda expuesto a internet, que es la diferencia entre "subí unos
archivos a S3" y un montaje serio.

Todo lo que sigue lo ejecutas tú en tu cuenta.

## Lo que se crea

| Recurso | Para qué |
|---|---|
| Bucket S3 privado | Guarda los archivos del sitio |
| CloudFront | CDN, HTTPS y punto de entrada público |
| Origin Access Control (OAC) | Única vía de acceso al bucket |
| CloudFront Function | Resuelve `/conversor/` → `/conversor/index.html` |
| Response Headers Policy | HSTS, CSP y demás cabeceras de seguridad |

## Requisitos

- AWS CLI configurada (`aws configure`) con permisos sobre S3, CloudFront y CloudFormation.
- Opcional: AWS SAM CLI, si prefieres `sam deploy`. La plantilla es CloudFormation puro, así que
  funciona igual con `aws cloudformation`.

## 1. Validar la plantilla

```bash
aws cloudformation validate-template --template-body file://infra/template.yaml
```

## 2. Crear la pila

Sin dominio propio (empieza por aquí, funciona de inmediato):

```bash
aws cloudformation deploy \
  --template-file infra/template.yaml \
  --stack-name cuentas-claras \
  --parameter-overrides NombreProyecto=cuentas-claras
```

La primera vez CloudFront tarda **entre 5 y 15 minutos** en desplegarse. Es normal.

Al terminar, pide las salidas:

```bash
aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query 'Stacks[0].Outputs' --output table
```

Guarda `NombreBucket`, `IdDistribucion` y `UrlCloudFront`.

## 3. Subir el sitio

```bash
BUCKET=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='NombreBucket'].OutputValue" --output text)

aws s3 sync web/ s3://$BUCKET --delete
```

`--delete` borra del bucket lo que ya no existe en `web/`, para que no queden archivos viejos
sirviéndose.

## 4. Invalidar la caché

CloudFront cachea de forma agresiva: sin este paso seguirás viendo la versión anterior.

```bash
DIST=$(aws cloudformation describe-stacks --stack-name cuentas-claras \
  --query "Stacks[0].Outputs[?OutputKey=='IdDistribucion'].OutputValue" --output text)

aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

Las primeras 1.000 rutas invalidadas al mes son gratis; después cuestan ~$0,005 cada una.
Invalidar `/*` cuenta como **una sola** ruta.

## 5. (Opcional) Dominio propio

1. Registra el dominio (Route 53 u otro registrador).
2. Pide el certificado **en la región `us-east-1`**, sin excepción: CloudFront no acepta
   certificados de ninguna otra región, y es el error que más tiempo hace perder aquí.

   ```bash
   aws acm request-certificate --region us-east-1 \
     --domain-name cuentasclaras.app --validation-method DNS
   ```

3. Valida el certificado creando el registro CNAME que indique ACM, y espera a que quede
   `ISSUED`.
4. Vuelve a desplegar pasando el dominio y el ARN:

   ```bash
   aws cloudformation deploy \
     --template-file infra/template.yaml \
     --stack-name cuentas-claras \
     --parameter-overrides \
       NombreProyecto=cuentas-claras \
       NombreDominio=cuentasclaras.app \
       CertificadoArn=arn:aws:acm:us-east-1:TU_CUENTA:certificate/TU_ID
   ```

5. Apunta el dominio a CloudFront. En Route 53, un registro **A de tipo alias** hacia la
   distribución (no un CNAME: el dominio raíz no admite CNAME). Fuera de Route 53, usa el valor
   de la salida `DominioParaDNS`.

## Actualizar el sitio después

Cada vez que cambies algo en `web/`:

```bash
aws s3 sync web/ s3://$BUCKET --delete
aws cloudfront create-invalidation --distribution-id $DIST --paths "/*"
```

## Costo

| Servicio | Costo |
|---|---|
| CloudFront | **$0** — 1 TB de salida y 10 M de peticiones al mes son *always free* y no expiran |
| CloudFront Functions | **$0** — 2 M de invocaciones gratis al mes |
| S3 | ~$0,02–0,10/mes con este volumen |
| ACM | **$0** |
| Route 53 (solo con dominio propio) | $0,50/mes por zona + ~$12–15/año el dominio |

En la práctica: **centavos al mes**, o alrededor de $1,50/mes con dominio propio.

Conviene igual poner una alarma de facturación en Budgets, por si algún día el tráfico se dispara.

## Si algo falla

| Síntoma | Causa casi siempre |
|---|---|
| 403 al abrir `/conversor/` | La CloudFront Function no está asociada, o se desplegó sin `AutoPublish` |
| 403 en todo el sitio | La política del bucket no coincide con el ARN de la distribución |
| Una herramienta no carga las tasas | Falta el dominio de esa API en `connect-src` de la CSP |
| Sigo viendo la versión vieja | Falta invalidar la caché (paso 4) |
| CloudFront rechaza el certificado | No está en `us-east-1` |

## Borrar todo

```bash
aws s3 rm s3://$BUCKET --recursive
aws cloudformation delete-stack --stack-name cuentas-claras
```

El bucket tiene `DeletionPolicy: Retain`, así que **sobrevive al borrado de la pila**: si quieres
eliminarlo del todo, hazlo a mano después.
