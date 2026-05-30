$envPath = 'C:\Users\denni\PycharmProjects\sayfix\.env.local'
$envContent = Get-Content $envPath -Raw
$apiKeyMatch = [regex]::Match($envContent, 'ELEVENLABS_API_KEY=(.+)')
$apiKey = $apiKeyMatch.Groups[1].Value.Trim()

$body = @{
    platform_settings = @{
        auth = @{
            enable_auth = $false
            require_origin_header = $false
        }
    }
} | ConvertTo-Json -Depth 10 -Compress

$response = Invoke-RestMethod -Uri 'https://api.elevenlabs.io/v1/convai/agents/agent_5901kshtcbw1er2vzka3wp1dqts5' -Method 'PATCH' -Body $body -ContentType 'application/json' -Headers @{
    'xi-api-key' = $apiKey
}

$response | ConvertTo-Json
