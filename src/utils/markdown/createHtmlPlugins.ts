import remarkParse from "remark-parse";
import remarkFrontmatter from "remark-frontmatter";
import {
	TYPE_FRONTMATTER,
	remarkProcessFrontmatter,
} from "./remark-process-frontmatter";
import remarkEmbedder, { RemarkEmbedderOptions } from "@remark-embedder/core";
import remarkGfm from "remark-gfm";
import rehypeUnwrapImages from "rehype-unwrap-images";
import { TwitchTransformer } from "./remark-embedder-twitch";
import oembedTransformer from "@remark-embedder/transformer-oembed";
import remarkToRehype from "remark-rehype";
import rehypeSlug from "rehype-slug-custom-id";
import rehypeRaw from "rehype-raw";
import { rehypeAstroImageMd } from "./picture/rehype-transform";
import { rehypePlayfulElementMap } from "./rehype-playful-element-map";
import { rehypeUnicornIFrameClickToRun } from "./iframes/rehype-transform";
import { rehypeHeaderText } from "./rehype-header-text";
import { rehypeHeaderClass } from "./rehype-header-class";
import { Processor } from "unified";
import { dirname, relative, resolve } from "path";
import type { VFile } from "vfile";
import { siteMetadata } from "../../constants/site-config";
import branch from "git-branch";
import { rehypeShikiUU } from "./shiki/rehype-transform";
import { rehypeCodeblockMeta } from "./shiki/rehype-codeblock-meta";
import { rehypePostShikiTransform } from "./shiki/rehype-post-shiki-transform";
import {
	rehypeDetailsElement,
	rehypeLinkPreview,
	rehypeTooltips,
	rehypeParseComponents,
	rehypePluginComponents,
	rehypeTransformComponents,
	rehypeValidateComponents,
	transformDetails,
	transformFileTree,
	transformInContentAd,
	transformLinkPreview,
	transformNoop,
	transformTabs,
	transformVoid,
} from "./components";

const currentBranch = process.env.VERCEL_GIT_COMMIT_REF ?? (await branch());

const remarkEmbedderDefault =
	(remarkEmbedder as never as { default: typeof remarkEmbedder }).default ??
	remarkEmbedder;

const oembedTransformerDefault =
	(oembedTransformer as never as { default: typeof oembedTransformer })
		.default ?? oembedTransformer;

export function createHtmlPlugins(unified: Processor) {
	return (
		unified
			.use(remarkParse, { fragment: true } as never)
			.use(remarkFrontmatter, {
				type: TYPE_FRONTMATTER,
				marker: "-",
			} as never)
			.use(remarkProcessFrontmatter)
			.use(remarkGfm)
			/* start remark plugins here */
			.use(
				remarkEmbedderDefault as never,
				{
					transformers: [oembedTransformerDefault, TwitchTransformer],
				} as RemarkEmbedderOptions,
			)
			.use(remarkToRehype, { allowDangerousHtml: true })
			// Remove complaining about "div cannot be in p element"
			.use(rehypeUnwrapImages)
			// This is required to handle unsafe HTML embedded into Markdown
			.use(rehypeRaw, { passThrough: ["mdxjsEsm"] })
			.use(rehypeParseComponents)
			// Do not add the tabs before the slug. We rely on some of the heading
			// logic in order to do some of the subheading logic
			.use(rehypeSlug as never, {
				maintainCase: true,
				removeAccents: true,
				enableCustomId: true,
			})
			/**
			 * Insert custom HTML generation code here
			 */
			.use(rehypeTooltips)
			.use(rehypeAstroImageMd)
			.use(rehypeLinkPreview)
			.use(rehypeDetailsElement)
			.use(rehypeUnicornIFrameClickToRun, {
				srcReplacements: [
					(val: string, file: VFile) => {
						const iFrameUrl = new URL(val);
						if (!iFrameUrl.protocol.startsWith("pfp-code:")) return val;

						const contentDir = dirname(file.path);
						const fullPath = resolve(contentDir, iFrameUrl.pathname);

						const fsRelativePath = relative(file.cwd, fullPath);

						// Windows paths need to be converted to URLs
						let urlRelativePath = fsRelativePath.replace(/\\/g, "/");

						if (urlRelativePath.startsWith("/")) {
							urlRelativePath = urlRelativePath.slice(1);
						}

						const q = iFrameUrl.search;
						const repoPath = siteMetadata.repoPath;
						const provider = `stackblitz.com/github`;
						return `
								https://${provider}/${repoPath}/tree/${currentBranch}/${urlRelativePath}${q}
							`.trim();
					},
				],
			})
			.use(rehypePlayfulElementMap)
			.use(rehypeValidateComponents)
			// Shiki is the last plugin before stringify, to avoid performance issues
			// with node traversal (shiki creates A LOT of element nodes)
			.use(rehypeCodeblockMeta)
			.use(...rehypeShikiUU)
			.use(rehypePostShikiTransform)
			.use(rehypeTransformComponents, {
				components: {
					filetree: transformFileTree,
					hint: transformDetails,
					"in-content-ad": transformInContentAd,
					"link-preview": transformLinkPreview,
					"no-ebook": transformNoop,
					"only-ebook": transformVoid,
					tabs: transformTabs,
				},
			})
			// rehypeHeaderText must occur AFTER rehypeTransformComponents to correctly ignore headings in role="tabpanel" and <details> elements
			.use(rehypeHeaderText)
			.use(rehypeHeaderClass, {
				// the page starts at h3 (under {title} -> "Post content")
				depth: 2,
				// visually, headings should start at h2-h6
				className: (depth: number) =>
					`text-style-headline-${Math.min(depth + 1, 6)}`,
			})
			.use(rehypePluginComponents, {
				htmlOptions: {
					allowDangerousHtml: true,
					voids: [],
				},
			})
	);
}
