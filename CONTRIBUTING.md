# 参与开发

欢迎提交问题和改进。提交前请先阅读 [README](README.md) 中的兼容边界。

## 报告问题

请说明浏览器版本、所在区域（评论 / 私信 / 收藏表情）、复现步骤及实际结果。截图请遮挡账号、私信内容等个人信息。**不要上传 Cookie、登录令牌、带签名的完整资源 URL 或浏览器配置文件。**

## 本地验证

无需安装运行依赖，Node.js 20+ 即可运行：

```sh
node --test tests/core.test.js tests/background.test.js
node --check content.js
node --check background.js
```

浏览器测试见 [TESTING.md](TESTING.md) 和 README。`work/` 为测试临时目录，已被 Git 忽略。

提交改动时请描述解决的问题、验证结果以及是否新增权限。请保持原资源下载路径，不引入截图转码、自动读取私信正文、认证绕过或远程执行代码。

