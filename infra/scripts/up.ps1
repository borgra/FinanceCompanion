param(
  [Parameter(Mandatory = $true)]
  [string] $SubscriptionId,

  [string] $ResourceGroupName = "rg-finance-companion",
  [string] $Location = "centralus",
  [string] $ParametersFile = "infra/parameters/dev.subscription.bicepparam"
)

$ErrorActionPreference = "Stop"

az account set --subscription $SubscriptionId

az deployment sub create `
  --name "finance-companion" `
  --location $Location `
  --template-file "infra/deploy.bicep" `
  --parameters $ParametersFile `
  --parameters resourceGroupName=$ResourceGroupName location=$Location `
  --only-show-errors
