// 测试文件 - 包含常见安全问题

// SQL 注入漏洞
function getUserById(id) {
  const query = "SELECT * FROM users WHERE id = " + id;  // 不安全
  return db.query(query);
}

// XSS 漏洞
function displayUserInput(input) {
  document.getElementById('output').innerHTML = input;  // 不安全
}

// 硬编码密码
const API_KEY = "sk-1234567890abcdef";  // 不安全

// 不安全的随机数
function generateToken() {
  return Math.random().toString(36);  // 不安全
}

// 命令注入
const exec = require('child_process').exec;
function runCommand(cmd) {
  exec(cmd);  // 不安全
}
