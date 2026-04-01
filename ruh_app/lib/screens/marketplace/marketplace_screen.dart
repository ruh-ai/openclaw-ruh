import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/theme.dart';

// ---------------------------------------------------------------------------
// Mock data — replace with API calls to /api/marketplace/listings
// ---------------------------------------------------------------------------

class _MarketplaceListing {
  final String id;
  final String name;
  final String description;
  final String category;
  final IconData icon;
  final double rating;
  final int installs;
  final bool isOnline;

  const _MarketplaceListing({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.icon,
    required this.rating,
    required this.installs,
    this.isOnline = true,
  });
}

const _mockAgents = [
  _MarketplaceListing(
    id: '1',
    name: 'Google Ads Manager',
    description: 'Manages Google Ads campaigns, optimizes bidding, and generates performance reports automatically.',
    category: 'Marketing',
    icon: LucideIcons.megaphone,
    rating: 4.8,
    installs: 1240,
  ),
  _MarketplaceListing(
    id: '2',
    name: 'Customer Support Agent',
    description: 'Handles customer inquiries via email and chat with empathy and accuracy.',
    category: 'Support',
    icon: LucideIcons.headphones,
    rating: 4.6,
    installs: 890,
  ),
  _MarketplaceListing(
    id: '3',
    name: 'Data Analyst',
    description: 'Analyzes datasets, generates insights, and creates visualization dashboards.',
    category: 'Data',
    icon: LucideIcons.barChart3,
    rating: 4.7,
    installs: 650,
  ),
  _MarketplaceListing(
    id: '4',
    name: 'Sales Outreach Agent',
    description: 'Crafts personalized outreach sequences and manages follow-up cadences.',
    category: 'Sales',
    icon: LucideIcons.send,
    rating: 4.5,
    installs: 430,
  ),
  _MarketplaceListing(
    id: '5',
    name: 'Code Reviewer',
    description: 'Reviews pull requests for bugs, security issues, and code quality improvements.',
    category: 'Engineering',
    icon: LucideIcons.gitPullRequest,
    rating: 4.9,
    installs: 2100,
  ),
  _MarketplaceListing(
    id: '6',
    name: 'HR Onboarding Assistant',
    description: 'Guides new hires through onboarding checklists and answers policy questions.',
    category: 'HR',
    icon: LucideIcons.userPlus,
    rating: 4.4,
    installs: 320,
  ),
  _MarketplaceListing(
    id: '7',
    name: 'Content Writer',
    description: 'Produces blog posts, social media content, and marketing copy aligned with brand voice.',
    category: 'Marketing',
    icon: LucideIcons.penTool,
    rating: 4.6,
    installs: 780,
  ),
  _MarketplaceListing(
    id: '8',
    name: 'Finance Reconciler',
    description: 'Reconciles transactions, flags discrepancies, and generates monthly reports.',
    category: 'Finance',
    icon: LucideIcons.calculator,
    rating: 4.3,
    installs: 210,
  ),
];

const _mockWorkflows = [
  _MarketplaceListing(
    id: 'w1',
    name: 'Lead Qualification Pipeline',
    description: 'Scores inbound leads, enriches data from CRM, and routes to the right sales rep.',
    category: 'Workflow',
    icon: LucideIcons.gitBranch,
    rating: 4.7,
    installs: 540,
  ),
  _MarketplaceListing(
    id: 'w2',
    name: 'Incident Response Chain',
    description: 'Detects anomalies, pages on-call, creates tickets, and posts status updates.',
    category: 'Workflow',
    icon: LucideIcons.alertTriangle,
    rating: 4.8,
    installs: 390,
  ),
  _MarketplaceListing(
    id: 'w3',
    name: 'Content Publishing Pipeline',
    description: 'Draft → review → SEO check → schedule → publish across multiple channels.',
    category: 'Workflow',
    icon: LucideIcons.workflow,
    rating: 4.5,
    installs: 270,
  ),
];

const _mockMcps = [
  _MarketplaceListing(
    id: 'm1',
    name: 'Google Workspace MCP',
    description: 'Gmail, Calendar, Drive, Sheets, Docs integration via Model Context Protocol.',
    category: 'MCP',
    icon: LucideIcons.cloud,
    rating: 4.9,
    installs: 3200,
  ),
  _MarketplaceListing(
    id: 'm2',
    name: 'Slack MCP',
    description: 'Send messages, read channels, manage threads, and react to messages.',
    category: 'MCP',
    icon: LucideIcons.messageSquare,
    rating: 4.7,
    installs: 2800,
  ),
  _MarketplaceListing(
    id: 'm3',
    name: 'PostgreSQL MCP',
    description: 'Query databases, run migrations, inspect schemas, and manage connections.',
    category: 'MCP',
    icon: LucideIcons.database,
    rating: 4.6,
    installs: 1500,
  ),
];

const _categories = ['All', 'Agents', 'Workflows', 'MCPs'];

// ---------------------------------------------------------------------------
// Marketplace Screen
// ---------------------------------------------------------------------------

class MarketplaceScreen extends StatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  State<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends State<MarketplaceScreen> {
  String _searchQuery = '';
  String _selectedCategory = 'All';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Hero section
          SliverToBoxAdapter(child: _buildHero(context)),
          // Search bar
          SliverToBoxAdapter(child: _buildSearchBar(context)),
          // Category chips
          SliverToBoxAdapter(child: _buildCategoryChips(context)),
          // Trending Agents
          if (_selectedCategory == 'All' || _selectedCategory == 'Agents') ...[
            SliverToBoxAdapter(child: _buildSectionHeader(context, 'Trending Agents', LucideIcons.trendingUp)),
            SliverToBoxAdapter(child: _buildGrid(context, _filterListings(_mockAgents))),
          ],
          // Popular Workflows
          if (_selectedCategory == 'All' || _selectedCategory == 'Workflows') ...[
            SliverToBoxAdapter(child: _buildSectionHeader(context, 'Popular Workflows', LucideIcons.gitBranch)),
            SliverToBoxAdapter(child: _buildGrid(context, _filterListings(_mockWorkflows))),
          ],
          // Featured MCPs
          if (_selectedCategory == 'All' || _selectedCategory == 'MCPs') ...[
            SliverToBoxAdapter(child: _buildSectionHeader(context, 'Featured MCPs', LucideIcons.plug)),
            SliverToBoxAdapter(child: _buildGrid(context, _filterListings(_mockMcps))),
          ],
          // Footer
          SliverToBoxAdapter(child: _buildFooter(context)),
        ],
      ),
    );
  }

  List<_MarketplaceListing> _filterListings(List<_MarketplaceListing> listings) {
    if (_searchQuery.isEmpty) return listings;
    final query = _searchQuery.toLowerCase();
    return listings.where((l) =>
      l.name.toLowerCase().contains(query) ||
      l.description.toLowerCase().contains(query) ||
      l.category.toLowerCase().contains(query)
    ).toList();
  }

  Widget _buildHero(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(24, 48, 24, 32),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFfdf4ff), Color(0xFFf3e8ff), Color(0xFFede9fe)],
        ),
      ),
      child: Column(
        children: [
          ShaderMask(
            shaderCallback: (bounds) => RuhTheme.brandGradient.createShader(bounds),
            child: const Text(
              'Discover & Deploy',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w700,
                color: Colors.white,
                height: 1.2,
              ),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            'Find the perfect AI agents, workflows, and tools to\ntransform your business, research, and development projects',
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 15,
              color: RuhTheme.textSecondary,
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
      child: Transform.translate(
        offset: const Offset(0, -20),
        child: Container(
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.08),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: TextField(
            onChanged: (v) => setState(() => _searchQuery = v),
            decoration: InputDecoration(
              hintText: 'Search agents, workflows, MCPs...',
              hintStyle: TextStyle(color: RuhTheme.textTertiary, fontSize: 15),
              prefixIcon: Icon(LucideIcons.search, color: RuhTheme.textTertiary, size: 20),
              border: InputBorder.none,
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCategoryChips(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 0, 24, 16),
      child: Row(
        children: _categories.map((cat) {
          final isSelected = cat == _selectedCategory;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilterChip(
              label: Text(cat),
              selected: isSelected,
              onSelected: (_) => setState(() => _selectedCategory = cat),
              labelStyle: TextStyle(
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                color: isSelected ? Colors.white : RuhTheme.textSecondary,
              ),
              backgroundColor: Colors.white,
              selectedColor: RuhTheme.primary,
              side: BorderSide(
                color: isSelected ? RuhTheme.primary : const Color(0xFFe5e7eb),
              ),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              showCheckmark: false,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildSectionHeader(BuildContext context, String title, IconData icon) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 16, 24, 12),
      child: Row(
        children: [
          Icon(icon, size: 18, color: RuhTheme.primary),
          const SizedBox(width: 8),
          Text(
            title,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const Spacer(),
          TextButton(
            onPressed: () {},
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'View all',
                  style: TextStyle(fontSize: 13, color: RuhTheme.primary),
                ),
                const SizedBox(width: 4),
                Icon(LucideIcons.arrowRight, size: 14, color: RuhTheme.primary),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGrid(BuildContext context, List<_MarketplaceListing> listings) {
    if (listings.isEmpty) {
      return Padding(
        padding: const EdgeInsets.all(24),
        child: Center(
          child: Text(
            'No results found',
            style: TextStyle(color: RuhTheme.textTertiary),
          ),
        ),
      );
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final width = constraints.maxWidth;
          final crossAxisCount = width > 1200 ? 4 : width > 900 ? 3 : width > 600 ? 2 : 1;
          return GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: crossAxisCount,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.6,
            ),
            itemCount: listings.length,
            itemBuilder: (context, index) => _ListingCard(listing: listings[index]),
          );
        },
      ),
    );
  }

  Widget _buildFooter(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 48),
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      decoration: BoxDecoration(
        color: const Color(0xFFF9FAFB),
        border: Border(top: BorderSide(color: const Color(0xFFe5e7eb), width: 1)),
      ),
      child: Column(
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Logo + tagline
              Expanded(
                flex: 2,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    ShaderMask(
                      shaderCallback: (bounds) => RuhTheme.brandGradient.createShader(bounds),
                      child: const Text(
                        'RUH',
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'The place to discover the latest AI agents,\nprotocols, and workflows to enhance\nyour AI capabilities.',
                      style: TextStyle(fontSize: 13, color: RuhTheme.textTertiary, height: 1.5),
                    ),
                  ],
                ),
              ),
              // Marketplace links
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Marketplace', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    _footerLink('Agents'),
                    _footerLink('MCPs'),
                    _footerLink('Workflows'),
                  ],
                ),
              ),
              // Company
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Company', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    _footerLink('About'),
                  ],
                ),
              ),
              // Legal
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Legal', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 12),
                    _footerLink('Privacy Policy'),
                    _footerLink('Terms of Service'),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          Text(
            '\u00a9 2026 RUH Marketplace. All rights reserved.',
            style: TextStyle(fontSize: 12, color: RuhTheme.textTertiary),
          ),
        ],
      ),
    );
  }

  Widget _footerLink(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: TextStyle(fontSize: 13, color: RuhTheme.textSecondary),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Listing Card
// ---------------------------------------------------------------------------

class _ListingCard extends StatefulWidget {
  final _MarketplaceListing listing;
  const _ListingCard({required this.listing});

  @override
  State<_ListingCard> createState() => _ListingCardState();
}

class _ListingCardState extends State<_ListingCard> {
  bool _hovered = false;

  @override
  Widget build(BuildContext context) {
    final listing = widget.listing;

    return MouseRegion(
      onEnter: (_) => setState(() => _hovered = true),
      onExit: (_) => setState(() => _hovered = false),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        decoration: BoxDecoration(
          color: _hovered ? const Color(0xFFFDF4FF) : Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: _hovered ? RuhTheme.primary.withValues(alpha: 0.3) : const Color(0xFFe5e7eb),
          ),
          boxShadow: [
            if (_hovered)
              BoxShadow(
                color: RuhTheme.primary.withValues(alpha: 0.08),
                blurRadius: 12,
                offset: const Offset(0, 4),
              )
            else
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.04),
                blurRadius: 4,
                offset: const Offset(0, 1),
              ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon + name + status
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: RuhTheme.accentLight,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(listing.icon, size: 20, color: RuhTheme.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          listing.name,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Container(
                              width: 6,
                              height: 6,
                              decoration: BoxDecoration(
                                color: listing.isOnline ? const Color(0xFF22c55e) : const Color(0xFFeab308),
                                shape: BoxShape.circle,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              listing.category,
                              style: TextStyle(fontSize: 11, color: RuhTheme.textTertiary),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              // Description
              Expanded(
                child: Text(
                  listing.description,
                  style: TextStyle(fontSize: 13, color: RuhTheme.textSecondary, height: 1.4),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              // Bottom: rating + installs
              Row(
                children: [
                  Icon(LucideIcons.star, size: 13, color: const Color(0xFFf59e0b)),
                  const SizedBox(width: 3),
                  Text(
                    listing.rating.toString(),
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                  ),
                  const SizedBox(width: 12),
                  Icon(LucideIcons.download, size: 13, color: RuhTheme.textTertiary),
                  const SizedBox(width: 3),
                  Text(
                    _formatCount(listing.installs),
                    style: TextStyle(fontSize: 12, color: RuhTheme.textTertiary),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _hovered ? RuhTheme.primary : const Color(0xFFF3F4F6),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      'Install',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: _hovered ? Colors.white : RuhTheme.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatCount(int count) {
    if (count >= 1000) return '${(count / 1000).toStringAsFixed(1)}k';
    return count.toString();
  }
}
