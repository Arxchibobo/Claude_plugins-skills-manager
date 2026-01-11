#!/bin/bash

echo "=========================================="
echo "  Claude Plugin Manager API 验证"
echo "=========================================="
echo ""

echo "1. 检查服务器状态..."
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3456/)
if [ "$STATUS" = "200" ]; then
    echo "   ✅ 服务器运行正常 (HTTP $STATUS)"
else
    echo "   ❌ 服务器未响应 (HTTP $STATUS)"
    exit 1
fi
echo ""

echo "2. 验证 Plugins API..."
PLUGINS_COUNT=$(curl -s http://localhost:3456/api/plugins | python -c "import sys, json; data=json.load(sys.stdin); print(len(data['plugins']))" 2>/dev/null)
if [ -n "$PLUGINS_COUNT" ]; then
    echo "   ✅ Plugins 总数: $PLUGINS_COUNT"
    ENABLED=$(curl -s http://localhost:3456/api/plugins | python -c "import sys, json; data=json.load(sys.stdin); print(sum(1 for p in data['plugins'] if p['enabled']))" 2>/dev/null)
    echo "   ✅ 已启用: $ENABLED"
    echo "   ✅ 已禁用: $((PLUGINS_COUNT - ENABLED))"
else
    echo "   ❌ 无法获取 Plugins 数据"
fi
echo ""

echo "3. 验证 Skills API..."
SKILLS_COUNT=$(curl -s http://localhost:3456/api/skills | python -c "import sys, json; data=json.load(sys.stdin); print(len(data['skills']))" 2>/dev/null)
if [ -n "$SKILLS_COUNT" ]; then
    echo "   ✅ Skills 总数: $SKILLS_COUNT"
    FILESYSTEM=$(curl -s http://localhost:3456/api/skills | python -c "import sys, json; data=json.load(sys.stdin); print(sum(1 for s in data['skills'] if s['source']=='filesystem'))" 2>/dev/null)
    echo "   ✅ 文件系统 Skills: $FILESYSTEM"
    MANAGED=$(curl -s http://localhost:3456/api/skills | python -c "import sys, json; data=json.load(sys.stdin); print(sum(1 for s in data['skills'] if s['source']=='settings'))" 2>/dev/null)
    echo "   ✅ 托管 Skills: $MANAGED"
else
    echo "   ❌ 无法获取 Skills 数据"
fi
echo ""

echo "4. 测试 Security Scan API..."
echo "   创建测试扫描请求..."
SCAN_ID=$(curl -s -X POST http://localhost:3456/api/security/scan \
    -H "Content-Type: application/json" \
    --data '{"path":"./test-scan","scope":"quick"}' | \
    python -c "import sys, json; data=json.load(sys.stdin); print(data.get('id', ''))" 2>/dev/null)

if [ -n "$SCAN_ID" ]; then
    echo "   ✅ 扫描已启动: $SCAN_ID"
    echo "   ⏳ 扫描状态: running (需要等待扫描完成)"
else
    echo "   ❌ 无法启动扫描"
fi
echo ""

echo "=========================================="
echo "  验证完成"
echo "=========================================="
echo ""
echo "📊 总结:"
echo "  - Plugins: $PLUGINS_COUNT 个 (启用: $ENABLED, 禁用: $((PLUGINS_COUNT - ENABLED)))"
echo "  - Skills: $SKILLS_COUNT 个 (文件系统: $FILESYSTEM, 托管: $MANAGED)"
echo "  - Security Scan: ${SCAN_ID:+已启用}"
echo ""
