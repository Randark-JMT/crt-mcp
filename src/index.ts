import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Certificate Search Result Interface
interface CertificateEntry {
	issuer_ca_id: number;
	issuer_name: string;
	common_name: string;
	name_value: string;
	id: number;
	entry_timestamp: string;
	not_before: string;
	not_after: string;
	serial_number: string;
}

interface CertificateSearchResult {
	total: number;
	certificates: CertificateEntry[];
	query: string;
	matchType: string;
}

// Certificate Search Service
class CertificateSearchService {
	private static readonly CRT_SH_API = "https://crt.sh";

	/**
	 * Search certificates by domain or pattern
	 * @param query - Domain name or search pattern
	 * @param matchType - Match type: exact, wildcard, or subdomain
	 * @param limit - Maximum number of results to return
	 */
	static async searchCertificates(
		query: string,
		matchType: "exact" | "wildcard" | "subdomain" = "exact",
		limit = 100,
	): Promise<CertificateSearchResult> {
		try {
			// Construct search query based on match type
			let searchQuery = query;
			if (matchType === "wildcard") {
				searchQuery = `%.${query}`;
			} else if (matchType === "subdomain") {
				searchQuery = `%.${query}`;
			}

			// Build API URL
			const apiUrl = `${this.CRT_SH_API}/?q=${encodeURIComponent(searchQuery)}&output=json`;

			// Fetch data from crt.sh
			const response = await fetch(apiUrl, {
				headers: {
					"User-Agent": "CRT-MCP-Server/1.0",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = (await response.json()) as CertificateEntry[];

			// Limit results
			const limitedData = data.slice(0, limit);

			return {
				total: data.length,
				certificates: limitedData,
				query: query,
				matchType: matchType,
			};
		} catch (error) {
			throw new Error(
				`Failed to search certificates: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Get detailed certificate information by ID
	 * @param certId - Certificate ID from crt.sh
	 */
	static async getCertificateDetails(certId: number): Promise<string> {
		try {
			const apiUrl = `${this.CRT_SH_API}/?id=${certId}`;

			const response = await fetch(apiUrl, {
				headers: {
					"User-Agent": "CRT-MCP-Server/1.0",
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			return await response.text();
		} catch (error) {
			throw new Error(
				`Failed to get certificate details: ${error instanceof Error ? error.message : "Unknown error"}`,
			);
		}
	}

	/**
	 * Analyze certificate results and provide insights
	 */
	static analyzeCertificates(certificates: CertificateEntry[]): string {
		if (certificates.length === 0) {
			return "No certificates found for analysis.";
		}

		// Group by issuer
		const issuerMap = new Map<string, number>();
		const domainSet = new Set<string>();
		const currentDate = new Date();
		let expiredCount = 0;
		let validCount = 0;

		for (const cert of certificates) {
			// Count by issuer
			const count = issuerMap.get(cert.issuer_name) || 0;
			issuerMap.set(cert.issuer_name, count + 1);

			// Collect unique domains
			const domains = cert.name_value.split("\n");
			for (const domain of domains) {
				domainSet.add(domain.trim());
			}

			// Check expiration
			const notAfter = new Date(cert.not_after);
			if (notAfter < currentDate) {
				expiredCount++;
			} else {
				validCount++;
			}
		}

		// Build analysis report
		let analysis = "=== 证书分析报告 ===\n\n";
		analysis += `总证书数: ${certificates.length}\n`;
		analysis += `有效证书: ${validCount}\n`;
		analysis += `已过期证书: ${expiredCount}\n`;
		analysis += `唯一域名数: ${domainSet.size}\n\n`;

		analysis += "=== 颁发机构分布 ===\n";
		const sortedIssuers = Array.from(issuerMap.entries()).sort(
			(a, b) => b[1] - a[1],
		);
		for (const [issuer, count] of sortedIssuers.slice(0, 10)) {
			analysis += `- ${issuer}: ${count} 个证书\n`;
		}

		return analysis;
	}
}

// Define our MCP agent with certificate search tools
export class CertificateMCP extends McpAgent {
	server = new McpServer({
		name: "Certificate Search MCP Server",
		version: "1.0.0",
	});

	async init() {
		// Certificate search tool
		this.server.tool(
			"search_certificates",
			{
				domain: z
					.string()
					.describe("要搜索的域名，例如：example.com, google.com"),
				matchType: z
					.enum(["exact", "wildcard", "subdomain"])
					.default("exact")
					.describe(
						"匹配类型：exact(精确匹配), wildcard(通配符匹配，包含子域名), subdomain(仅子域名)",
					),
				limit: z
					.number()
					.min(1)
					.max(1000)
					.default(100)
					.describe("返回结果的最大数量"),
			},
			async ({ domain, matchType, limit }) => {
				try {
					const result = await CertificateSearchService.searchCertificates(
						domain,
						matchType,
						limit,
					);

					if (result.certificates.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: `未找到域名 "${domain}" 的证书记录（匹配类型: ${matchType}）`,
								},
							],
						};
					}

					// Format results
					let output = `=== 证书搜索结果 ===\n`;
					output += `查询域名: ${result.query}\n`;
					output += `匹配类型: ${result.matchType}\n`;
					output += `总计: ${result.total} 个证书（显示前 ${result.certificates.length} 个）\n\n`;

					// Show top results
					const displayCount = Math.min(10, result.certificates.length);
					output += `=== 前 ${displayCount} 个证书 ===\n\n`;

					for (let i = 0; i < displayCount; i++) {
						const cert = result.certificates[i];
						output += `证书 #${i + 1}:\n`;
						output += `  ID: ${cert.id}\n`;
						output += `  通用名: ${cert.common_name}\n`;
						output += `  颁发者: ${cert.issuer_name}\n`;
						output += `  生效日期: ${cert.not_before}\n`;
						output += `  过期日期: ${cert.not_after}\n`;
						output += `  序列号: ${cert.serial_number}\n`;

						const domains = cert.name_value.split("\n");
						if (domains.length > 1) {
							output += `  包含域名: ${domains.length} 个\n`;
							output += `    - ${domains.slice(0, 3).join("\n    - ")}\n`;
							if (domains.length > 3) {
								output += `    ... 还有 ${domains.length - 3} 个域名\n`;
							}
						} else {
							output += `  域名: ${domains[0]}\n`;
						}
						output += "\n";
					}

					if (result.certificates.length > displayCount) {
						output += `... 还有 ${result.certificates.length - displayCount} 个证书未显示\n\n`;
					}

					// Add analysis
					output += CertificateSearchService.analyzeCertificates(
						result.certificates,
					);

					return {
						content: [
							{
								type: "text",
								text: output,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `证书搜索失败: ${error instanceof Error ? error.message : "未知错误"}`,
							},
						],
					};
				}
			},
		);

		// Certificate detail retrieval tool
		this.server.tool(
			"get_certificate_details",
			{
				certId: z
					.number()
					.describe("证书ID（从 search_certificates 结果中获取）"),
			},
			async ({ certId }) => {
				try {
					const details =
						await CertificateSearchService.getCertificateDetails(certId);

					return {
						content: [
							{
								type: "text",
								text: `=== 证书详情 (ID: ${certId}) ===\n\n${details}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `获取证书详情失败: ${error instanceof Error ? error.message : "未知错误"}`,
							},
						],
					};
				}
			},
		);

		// Analyze certificates tool
		this.server.tool(
			"analyze_certificates",
			{
				domain: z.string().describe("要分析的域名"),
				matchType: z
					.enum(["exact", "wildcard", "subdomain"])
					.default("wildcard")
					.describe("匹配类型"),
			},
			async ({ domain, matchType }) => {
				try {
					const result = await CertificateSearchService.searchCertificates(
						domain,
						matchType,
						1000,
					);

					if (result.certificates.length === 0) {
						return {
							content: [
								{
									type: "text",
									text: `未找到域名 "${domain}" 的证书记录进行分析`,
								},
							],
						};
					}

					const analysis = CertificateSearchService.analyzeCertificates(
						result.certificates,
					);

					// Add domain list
					const domainSet = new Set<string>();
					for (const cert of result.certificates) {
						const domains = cert.name_value.split("\n");
						for (const d of domains) {
							domainSet.add(d.trim());
						}
					}

					const sortedDomains = Array.from(domainSet).sort();
					let output = analysis;
					output += "\n=== 发现的所有域名 ===\n";

					const displayLimit = 50;
					for (
						let i = 0;
						i < Math.min(displayLimit, sortedDomains.length);
						i++
					) {
						output += `${i + 1}. ${sortedDomains[i]}\n`;
					}

					if (sortedDomains.length > displayLimit) {
						output += `... 还有 ${sortedDomains.length - displayLimit} 个域名未显示\n`;
					}

					return {
						content: [
							{
								type: "text",
								text: output,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `证书分析失败: ${error instanceof Error ? error.message : "未知错误"}`,
							},
						],
					};
				}
			},
		);

		// Get help information
		this.server.tool("get_help", {}, async () => {
			const helpText = `=== Certificate Search MCP Server 帮助 ===

本服务提供基于 crt.sh 的证书搜索和分析功能。

可用工具：

1. search_certificates
   搜索指定域名的SSL/TLS证书
   参数：
   - domain: 域名（必需）
   - matchType: 匹配类型（可选，默认：exact）
     * exact: 精确匹配指定域名
     * wildcard: 包含所有子域名
     * subdomain: 仅匹配子域名
   - limit: 最大结果数（可选，默认：100）

2. get_certificate_details
   获取指定证书的详细信息
   参数：
   - certId: 证书ID（从搜索结果中获取）

3. analyze_certificates
   分析域名的证书使用情况
   参数：
   - domain: 域名（必需）
   - matchType: 匹配类型（可选，默认：wildcard）

使用场景：
- 域名资产发现
- 证书过期监控
- 子域名枚举
- SSL/TLS证书审计
- 安全研判分析

示例：
- 搜索域名证书：search_certificates(domain="example.com", matchType="wildcard")
- 分析域名：analyze_certificates(domain="example.com")
- 查看详情：get_certificate_details(certId=123456789)
`;

			return {
				content: [
					{
						type: "text",
						text: helpText,
					},
				],
			};
		});
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		// MCP endpoints
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return CertificateMCP.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return CertificateMCP.serve("/mcp").fetch(request, env, ctx);
		}

		// API endpoint for certificate search
		if (url.pathname === "/api/certificates/search") {
			return this.handleApiSearch(request);
		}

		// API endpoint for certificate details
		if (url.pathname === "/api/certificates/details") {
			return this.handleApiDetails(request);
		}

		// Root endpoint with service info
		return new Response(
			`Certificate Search MCP Server

Available endpoints:
- /sse : MCP SSE endpoint
- /mcp : MCP HTTP endpoint
- /api/certificates/search : REST API for certificate search
- /api/certificates/details : REST API for certificate details

Data source: crt.sh
Service version: 1.0.0`,
			{
				status: 200,
				headers: { "Content-Type": "text/plain" },
			},
		);
	},

	async handleApiSearch(request: Request): Promise<Response> {
		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "POST, GET, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		try {
			let domain: string;
			let matchType: "exact" | "wildcard" | "subdomain" = "exact";
			let limit = 100;

			if (request.method === "GET") {
				const url = new URL(request.url);
				domain = url.searchParams.get("domain") || "";
				matchType =
					(url.searchParams.get("matchType") as
						| "exact"
						| "wildcard"
						| "subdomain") || "exact";
				limit = Number.parseInt(url.searchParams.get("limit") || "100", 10);
			} else if (request.method === "POST") {
				const body = (await request.json()) as {
					domain: string;
					matchType?: "exact" | "wildcard" | "subdomain";
					limit?: number;
				};
				domain = body.domain;
				matchType = body.matchType || "exact";
				limit = body.limit || 100;
			} else {
				return new Response("Method not allowed", { status: 405 });
			}

			if (!domain) {
				return new Response(JSON.stringify({ error: "Domain is required" }), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				});
			}

			const result = await CertificateSearchService.searchCertificates(
				domain,
				matchType,
				limit,
			);

			return new Response(JSON.stringify(result), {
				headers: {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": "*",
				},
			});
		} catch (error) {
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				}),
				{
					status: 500,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				},
			);
		}
	},

	async handleApiDetails(request: Request): Promise<Response> {
		// Handle CORS preflight
		if (request.method === "OPTIONS") {
			return new Response(null, {
				headers: {
					"Access-Control-Allow-Origin": "*",
					"Access-Control-Allow-Methods": "GET, OPTIONS",
					"Access-Control-Allow-Headers": "Content-Type",
					"Access-Control-Max-Age": "86400",
				},
			});
		}

		if (request.method !== "GET") {
			return new Response("Method not allowed", { status: 405 });
		}

		try {
			const url = new URL(request.url);
			const certIdStr = url.searchParams.get("certId");

			if (!certIdStr) {
				return new Response(JSON.stringify({ error: "certId is required" }), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				});
			}

			const certId = Number.parseInt(certIdStr, 10);
			if (Number.isNaN(certId)) {
				return new Response(JSON.stringify({ error: "Invalid certId" }), {
					status: 400,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				});
			}

			const details =
				await CertificateSearchService.getCertificateDetails(certId);

			return new Response(
				JSON.stringify({
					success: true,
					certId: certId,
					details: details,
				}),
				{
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				},
			);
		} catch (error) {
			return new Response(
				JSON.stringify({
					success: false,
					error: error instanceof Error ? error.message : "Unknown error",
				}),
				{
					status: 500,
					headers: {
						"Content-Type": "application/json",
						"Access-Control-Allow-Origin": "*",
					},
				},
			);
		}
	},
};
