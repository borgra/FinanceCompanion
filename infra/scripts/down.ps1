param(
  [Parameter(Mandatory = $true)]
  [string] $SubscriptionId,

  [string] $ResourceGroupName = "rg-finance-companion-dev",

  [switch] $NoWait
)

$ErrorActionPreference = "Stop"

az account set --subscription $SubscriptionId

if ($NoWait) {
  az group delete --name $ResourceGroupName --yes --no-wait --only-show-errors
} else {
  az group delete --name $ResourceGroupName --yes --only-show-errors
}
