#Requires -Version 5.1
<#
.SYNOPSIS
    从母项目的 _模板/ 生成一个新项目。

.DESCRIPTION
    把 _母项目\_模板\ 复制到 <工作区根>\<Name>\，替换 {{占位符}}，
    把 AGENTS.md.template 还原成 AGENTS.md，并创建 artifacts/ 空目录。

    新项目建在【工作区根】下（即 _母项目 的同级），不是建在 _母项目 里面。

    本脚本【不会】执行 git add 或 git commit。加 -Git 也只做 git init。

.PARAMETER Name
    新项目的目录名。必填。

.PARAMETER Description
    一句话项目定位，会写进 PROJECT_INDEX.md 和 README.md。

.PARAMETER Git
    顺带在新项目里执行 git init（仅 init，不 add、不 commit）。

    ⚠️ 慎用。DSH 判定「项目根」的方式是：从 cwd 向上找**最近的** .git
    （dsh-agent-instructions 的 findProjectRoot），指令链只覆盖「项目根 → cwd」。
    新项目一旦自带 .git，项目根就变成新项目自己，
    母项目根 AGENTS.md（母项目规范）将**不再自动加载**。
    不带 .git 时项目根 = 工作区根，母项目规范与项目 AGENTS.md 会一起自动加载。

.EXAMPLE
    cd "%USERPROFILE%\Desktop\Agent 项目\_母项目"
    .\新建项目.ps1 -Name "我的项目" -Description "解决某某问题"

.EXAMPLE
    & "%USERPROFILE%\Desktop\Agent 项目\_母项目\新建项目.ps1" -Name "我的项目" -Git
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0, HelpMessage = '新项目的目录名')]
    [ValidateNotNullOrEmpty()]
    [string]$Name,

    [string]$Description = '（待填写：一句话说明这个项目要解决什么问题）',

    [switch]$Git
)

$ErrorActionPreference = 'Stop'

# ---------- 路径 ----------
# 本脚本在 <工作区根>\_母项目\ 下，所以脚本目录的上一级才是工作区根。
$MotherRoot  = Split-Path -Parent $PSScriptRoot
$TemplateDir = Join-Path $PSScriptRoot '_模板'
$TargetDir   = Join-Path $MotherRoot $Name

# ---------- 前置检查 ----------
if (-not (Test-Path -LiteralPath $TemplateDir -PathType Container)) {
    throw "模板目录不存在：$TemplateDir"
}
if ($Name -match '[\\/:*?"<>|]') {
    throw '项目名不能包含这些字符：\ / : * ? " < > |'
}
if ($Name -match '^\.+$' -or $Name -match '[ .]$') {
    throw '项目名不能是纯点号，也不能以点或空格结尾（Windows 会静默去掉）。'
}
if (Test-Path -LiteralPath $TargetDir) {
    throw "目标已存在，拒绝覆盖：$TargetDir`n如要重建，请先自行归档或移走原目录。"
}

Write-Host "==> 从模板生成项目：$Name" -ForegroundColor Cyan

# ---------- 1. 复制模板 ----------
Copy-Item -LiteralPath $TemplateDir -Destination $TargetDir -Recurse -Force

# ---------- 2. 替换占位符 ----------
$CreatedDate = Get-Date -Format 'yyyy-MM-dd'
$NoBom       = New-Object System.Text.UTF8Encoding($false)   # UTF-8 无 BOM
$Utf8Read    = New-Object System.Text.UTF8Encoding($false)
$TextExts    = @('.md', '.txt', '.ps1', '.js', '.json', '.yml', '.yaml', '.gitignore', '.template')

$replaced = 0
Get-ChildItem -LiteralPath $TargetDir -Recurse -File -Force | ForEach-Object {
    $ext         = $_.Extension
    $isGitignore = ($_.Name -eq '.gitignore')
    if (($TextExts -notcontains $ext) -and (-not $isGitignore)) { return }

    $text = [System.IO.File]::ReadAllText($_.FullName, $Utf8Read)
    $new  = $text.Replace('{{PROJECT_NAME}}', $Name).
                 Replace('{{PROJECT_DESC}}', $Description).
                 Replace('{{CREATED_DATE}}', $CreatedDate).
                 Replace('{{PROJECT_PATH}}', $TargetDir).
                 Replace('{{MOTHER_ROOT}}', $MotherRoot)
    if ($new -ne $text) {
        [System.IO.File]::WriteAllText($_.FullName, $new, $NoBom)
        $replaced++
    }
}

# ---------- 3. 还原 AGENTS.md ----------
# 模板里叫 AGENTS.md.template，是为了避免带占位符的草稿被 DSH 当成真规则自动加载。
$tplAgents = Join-Path $TargetDir 'AGENTS.md.template'
if (Test-Path -LiteralPath $tplAgents) {
    Move-Item -LiteralPath $tplAgents -Destination (Join-Path $TargetDir 'AGENTS.md') -Force
}
else {
    Write-Warning "没找到 AGENTS.md.template —— 新项目将缺少项目规则文件，请手工补。"
}

# ---------- 4. 补空目录（Copy-Item 不保留空目录）----------
foreach ($sub in @('artifacts')) {
    $p = Join-Path $TargetDir $sub
    if (-not (Test-Path -LiteralPath $p)) {
        New-Item -ItemType Directory -Path $p | Out-Null
    }
}

# ---------- 5. 可选 git init ----------
if ($Git) {
    Push-Location -LiteralPath $TargetDir
    try {
        & git init --quiet
        if ($LASTEXITCODE -eq 0) {
            Write-Host '==> 已执行 git init（未 add、未 commit）' -ForegroundColor Green
            Write-Warning '本项目现在自带 .git —— 项目根变成本项目自己，母项目规范将不再自动加载。'
            Write-Warning '子项目会话里必须手工 read 母项目 AGENTS.md；想恢复自动加载请删掉本项目的 .git。'
        }
        else {
            Write-Warning "git init 退出码 $LASTEXITCODE —— 请手工检查。"
        }
    }
    finally {
        Pop-Location
    }
}

# ---------- 6. 摘要 ----------
Write-Host ''
Write-Host "==> 完成：$TargetDir" -ForegroundColor Green
Write-Host "    已替换占位符的文件数：$replaced"
Write-Host ''
Write-Host '你的新项目长这样：' -ForegroundColor Cyan
Write-Host '    AGENTS.md              <- 固定规则（会话自动加载）'
Write-Host '    PROJECT_INDEX.md       <- 索引，2-4 KB 上限'
Write-Host '    README.md              <- 给人看的说明'
Write-Host '    docs\context\          <- NOW / MAP / RUNBOOK / DECISIONS / RISKS'
Write-Host '    docs\history\          <- 逐轮归档（devlog 格式）'
Write-Host '    scripts\               <- 验证与构建脚本'
Write-Host '    artifacts\             <- 中间产物（不进版本库）'
Write-Host ''
Write-Host '下一步（必做，否则新项目等于没规范）：' -ForegroundColor Yellow
Write-Host '  1. 填 AGENTS.md 里三处 TODO：代码约定 / 安全边界 / 最小验收'
Write-Host '  2. 填 PROJECT_INDEX.md 的「权威版本」和「活动里程碑」'
Write-Host "  3. 在 Obsidian 的 DSH\projects\ 建本项目的仪表盘页"
Write-Host "  4. 把本项目登记到母项目的 PROJECT_INDEX.md「子项目」表"
Write-Host ''
Write-Host '之后按 AGENTS.md -> PROJECT_INDEX.md -> 单个专题文件的顺序工作。'
