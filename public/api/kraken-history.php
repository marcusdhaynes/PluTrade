<?php
declare(strict_types=1);
/**
 * Same-origin, READ-ONLY Kraken Futures history endpoint for plutrade.com.
 * No arbitrary URLs, symbols, scripts, credentials, or broker/order operations.
 */
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function reply(int $status, array $body): never {
    http_response_code($status);
    echo json_encode($body, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
    header('Allow: GET');
    reply(405, ['error' => 'Method not allowed']);
}
$symbol = $_GET['symbol'] ?? null;
$resolution = $_GET['resolution'] ?? '1m';
$allowed = ['1m', '5m', '15m', '30m', '1h', '4h', '12h', '1d', '1w'];
if (!is_string($symbol) || !preg_match('/^(?:PF|PI|FI)_[A-Z0-9]{2,32}$/D', $symbol)
    || !is_string($resolution) || !in_array($resolution, $allowed, true)) {
    reply(400, ['error' => 'Invalid instrument or resolution']);
}
$upstream = 'https://futures.kraken.com/api/charts/v1/trade/'
    . rawurlencode($symbol) . '/' . rawurlencode($resolution);

$raw = false;
$status = 0;
if (function_exists('curl_init')) {
    $handle = curl_init($upstream);
    if (!$handle) reply(503, ['error' => 'Provider client unavailable']);
    curl_setopt_array($handle, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 3,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_HTTPHEADER => ['Accept: application/json'],
        CURLOPT_USERAGENT => 'PluTradeMarketHistory/1.0',
    ]);
    $raw = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    curl_close($handle);
} else {
    $options = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 8,
            'follow_location' => 0,
            'header' => "Accept: application/json\r\nUser-Agent: PluTradeMarketHistory/1.0\r\n",
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ]);
    $raw = @file_get_contents($upstream, false, $options);
    foreach (($http_response_header ?? []) as $line) {
        if (preg_match('/^HTTP\/\S+\s+(\d{3})/', $line, $match)) $status = (int) $match[1];
    }
}
if (!is_string($raw) || $status !== 200 || strlen($raw) > 4_000_000) {
    reply(502, ['error' => 'Kraken history temporarily unavailable']);
}
$data = json_decode($raw, true);
if (!is_array($data) || !isset($data['candles']) || !is_array($data['candles'])) {
    reply(502, ['error' => 'Invalid Kraken history response']);
}
$clean = [];
foreach (array_slice($data['candles'], -2000) as $c) {
    if (!is_array($c)) continue;
    $fields = ['time', 'open', 'high', 'low', 'close', 'volume'];
    foreach ($fields as $field) {
        if (!isset($c[$field]) || !is_numeric($c[$field])) continue 2;
    }
    $open = (float)$c['open'];
    $high = (float)$c['high'];
    $low = (float)$c['low'];
    $close = (float)$c['close'];
    $volume = (float)$c['volume'];
    if (!is_finite($open) || !is_finite($high) || !is_finite($low)
        || !is_finite($close) || !is_finite($volume)
        || $open <= 0 || $close <= 0 || $low <= 0 || $volume < 0
        || $high < max($open, $close) || $low > min($open, $close)) continue;
    $clean[] = $c;
}
header('Cache-Control: public, max-age=5, s-maxage=15, stale-while-revalidate=15');
reply(200, ['candles' => $clean, 'source' => 'Kraken Futures', 'retrievedAt' => gmdate('c')]);
