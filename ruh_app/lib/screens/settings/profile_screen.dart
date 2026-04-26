import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lucide_icons/lucide_icons.dart';

import '../../config/responsive.dart';
import '../../config/theme.dart';
import '../../providers/auth_provider.dart';

/// Profile screen for viewing and editing user account information.
class ProfileScreen extends ConsumerStatefulWidget {
  const ProfileScreen({super.key});

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  late TextEditingController _displayNameController;
  bool _isSaving = false;
  bool _hasChanges = false;

  @override
  void initState() {
    super.initState();
    final session = ref.read(authControllerProvider).session;
    _displayNameController = TextEditingController(
      text: session?.user.displayName ?? '',
    );
    _displayNameController.addListener(_onChanged);
  }

  void _onChanged() {
    final session = ref.read(authControllerProvider).session;
    final original = session?.user.displayName ?? '';
    final changed = _displayNameController.text.trim() != original;
    if (changed != _hasChanges) {
      setState(() => _hasChanges = changed);
    }
  }

  Future<void> _save() async {
    if (!_hasChanges || _isSaving) return;
    setState(() => _isSaving = true);

    try {
      final success = await ref
          .read(authControllerProvider.notifier)
          .updateProfile(displayName: _displayNameController.text.trim());
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(success ? 'Profile updated' : 'Could not update profile'),
          behavior: SnackBarBehavior.floating,
        ),
      );
      if (success) setState(() => _hasChanges = false);
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  void dispose() {
    _displayNameController.removeListener(_onChanged);
    _displayNameController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final session = ref.watch(authControllerProvider).session;

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(LucideIcons.arrowLeft),
          onPressed: () => context.canPop() ? context.pop() : context.go('/settings'),
        ),
        title: const Text('Profile'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Avatar / initials
          Center(
            child: Container(
              width: 80,
              height: 80,
              decoration: BoxDecoration(
                gradient: RuhTheme.brandGradient,
                borderRadius: BorderRadius.circular(20),
              ),
              child: Center(
                child: Text(
                  _initials(session),
                  style: theme.textTheme.headlineLarge?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
          ),
          const SizedBox(height: 24),

          // Email (read-only)
          Text(
            'Email',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            readOnly: true,
            controller: TextEditingController(text: session?.user.email ?? ''),
            decoration: InputDecoration(
              prefixIcon: Icon(
                LucideIcons.mail,
                size: IconSizes.md,
                color: RuhTheme.textTertiary,
              ),
              suffixIcon: Icon(
                LucideIcons.lock,
                size: IconSizes.sm,
                color: RuhTheme.textTertiary,
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Display name (editable)
          Text(
            'Display Name',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _displayNameController,
            decoration: InputDecoration(
              hintText: 'Enter your name',
              hintStyle: TextStyle(color: RuhTheme.textTertiary),
              prefixIcon: Icon(
                LucideIcons.user,
                size: IconSizes.md,
                color: RuhTheme.textTertiary,
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Role (read-only)
          Text(
            'Role',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            readOnly: true,
            controller: TextEditingController(
              text: session?.activeMembership?.role ?? session?.user.role ?? 'user',
            ),
            decoration: InputDecoration(
              prefixIcon: Icon(
                LucideIcons.shield,
                size: IconSizes.md,
                color: RuhTheme.textTertiary,
              ),
              suffixIcon: Icon(
                LucideIcons.lock,
                size: IconSizes.sm,
                color: RuhTheme.textTertiary,
              ),
            ),
          ),
          const SizedBox(height: 20),

          // Organization (read-only)
          Text(
            'Organization',
            style: theme.textTheme.labelMedium?.copyWith(
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          TextField(
            readOnly: true,
            controller: TextEditingController(
              text: session?.activeOrganization?.name ?? 'None',
            ),
            decoration: InputDecoration(
              prefixIcon: Icon(
                LucideIcons.building2,
                size: IconSizes.md,
                color: RuhTheme.textTertiary,
              ),
              suffixIcon: Icon(
                LucideIcons.lock,
                size: IconSizes.sm,
                color: RuhTheme.textTertiary,
              ),
            ),
          ),
          const SizedBox(height: 32),

          // Save button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              onPressed: _hasChanges && !_isSaving ? _save : null,
              icon: _isSaving
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : Icon(LucideIcons.save, size: IconSizes.md),
              label: Text(_isSaving ? 'Saving...' : 'Save Changes'),
            ),
          ),
        ],
      ),
    );
  }

  String _initials(dynamic session) {
    if (session == null) return '?';
    final name = session.user.displayName as String?;
    if (name != null && name.isNotEmpty) {
      final parts = name.trim().split(' ');
      if (parts.length >= 2) {
        return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
      }
      return parts.first[0].toUpperCase();
    }
    final email = session.user.email as String? ?? '';
    return email.isNotEmpty ? email[0].toUpperCase() : '?';
  }
}
