# COUNTR Phase 4E-1
# Run from the storemate_mobile project root.
# Creates a timestamped backup, then replaces the old POS voice handler with
# the Phase 4D integration call.

$ErrorActionPreference = "Stop"

$path = Join-Path (Get-Location) "src\screens\POSScreen.js"

if (!(Test-Path $path)) {
    throw "POSScreen.js not found: $path"
}

$source = Get-Content -Raw -Encoding UTF8 $path

$backup = "$path.phase4E1-backup"
Copy-Item $path $backup -Force

# Add the Phase 4D import after the VoiceCommandRouter import if needed.
if ($source -notmatch "POSVoiceIntegrationPhase4D") {
    $source = $source -replace `
        "import\s+\{\s*parseVoiceCommand\s*\}\s+from\s+'../core/ai/VoiceCommandRouter';",
        "import { parseVoiceCommand } from '../core/ai/VoiceCommandRouter';`r`nimport { processPOSVoiceCommand as processPOSVoiceCommandPhase4D } from '../core/ai/POSVoiceIntegrationPhase4D';"
}

# If the screen already contains Phase 4D, do not patch it twice.
if ($source -match "processPOSVoiceCommandPhase4D") {

    # Replace the body of the local voice handler only when the current file
    # still contains the old executor/direct-network implementation.
    $start = $source.IndexOf("const processPOSVoiceCommand = async text =>")
    if ($start -lt 0) {
        $start = $source.IndexOf("const processPOSVoiceCommand =")
    }

    if ($start -ge 0) {
        $nextMarker = $source.IndexOf("/*", $start + 20)
        if ($nextMarker -gt $start) {
            $oldBlock = $source.Substring($start, $nextMarker - $start)

            if ($oldBlock -match "executeCommand|parse-intent|IntentHandler") {
                $newBlock = @'
const processPOSVoiceCommand = async text => {
  setAiStatus('Understanding...');
  const startTime = Date.now();

  try {
    const ownerId = await requireCurrentUserId();

    const result = await processPOSVoiceCommandPhase4D({
      text,
      inventory: inventoryRef.current,
      customerNames: [],
      ownerId,

      handlers: {
        addItem: async received => {
          const match = inventoryRef.current.find(
            item => item.id === received.resolved_inventory_id
          );

          if (!match) {
            throw new Error(
              'Resolved inventory item is no longer available.'
            );
          }

          addToCart(
            match,
            Number(received.quantity)
          );

          return {
            product: match.productName,
            quantity: Number(received.quantity),
            inventoryId: match.id,
          };
        },

        applyDiscount: async received => {
          const value =
            Number(received.discount_percent);

          setDiscount(value);
          return value;
        },

        checkout: async received => {
          if (!cart.length) {
            throw new Error('Cart is empty.');
          }

          if (
            received.payment_type === 'CASH' ||
            received.payment_type === 'KHATA'
          ) {
            await processCheckout(
              received.payment_type
            );

            return received.payment_type;
          }

          return 'READY_FOR_PAYMENT';
        },
      },
    });

    if (!result || result.status !== 'EXECUTED') {
      setAiStatus(
        result?.reason ||
        'Command could not be executed.'
      );
      return;
    }

    if (
      result.result &&
      result.result.product
    ) {
      setAiStatus(
        `✓ ${result.result.quantity} × ${result.result.product} added`
      );
      return;
    }

    setAiStatus(
      'Command complete.'
    );

  } catch (error) {
    const latencyMs =
      Date.now() - startTime;

    setAiStatus(
      error?.name === 'AbortError'
        ? 'AI request timed out. Try again.'
        : 'Could not process that. Try again.'
    );

    TelemetryService.logError(
      'pos_voice_ai',
      error?.message ||
        'Voice command failed',
      error?.stack
    );
  }
};

'@

                $source = $source.Replace($oldBlock, $newBlock)
            }
        }
    }
}

Set-Content -Path $path -Value $source -Encoding UTF8

Write-Host ""
Write-Host "COUNTR Phase 4E-1 patch applied." -ForegroundColor Green
Write-Host "Backup: $backup" -ForegroundColor Yellow
Write-Host ""
Write-Host "Now run:" -ForegroundColor Cyan
Write-Host "npx jest testPOSScreenVoiceIntegrationPhase4E1 --runInBand"
