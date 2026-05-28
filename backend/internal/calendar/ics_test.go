package calendar

import (
	"strings"
	"testing"
	"unicode/utf8"
)

// TestSplitLineUTF8Boundaries verifies the fold never splits a multi-byte rune
// and respects the octet budget. Seed data contains German text plus ≥, •, and
// em-dashes, all multi-byte in UTF-8.
func TestSplitLineUTF8Boundaries(t *testing.T) {
	cases := []string{
		"",
		"short ascii",
		strings.Repeat("a", 73), // exactly the limit
		strings.Repeat("a", 74), // one over
		strings.Repeat("ä", 80), // 2-byte runes
		strings.Repeat("•", 60), // 3-byte runes
		"Maintenance mode aktiv — Rollout im Pair ≥ 1h, prod ≥ 1w • mehrere Stages — " + strings.Repeat("ä", 40),
	}
	const n = 73
	for _, in := range cases {
		chunks := splitLine(in, n)
		// Reassembly must be lossless.
		if got := strings.Join(chunks, ""); got != in {
			t.Fatalf("reassembly mismatch for %q: got %q", in, got)
		}
		for _, c := range chunks {
			if len(c) > n {
				t.Fatalf("chunk exceeds %d octets (%d): %q", n, len(c), c)
			}
			if !utf8.ValidString(c) {
				t.Fatalf("chunk is not valid UTF-8 (rune split): %q", c)
			}
		}
	}
}

// TestSplitLineNoSplitRune specifically targets a cut that lands inside a rune.
func TestSplitLineNoSplitRune(t *testing.T) {
	// 36 three-byte runes = 108 octets; folding at 73 would cut octet 73 which
	// is mid-rune (73 % 3 == 1) unless we back up to a boundary.
	in := strings.Repeat("•", 36)
	for _, c := range splitLine(in, 73) {
		if !utf8.ValidString(c) {
			t.Fatalf("split a rune: %q", c)
		}
	}
}
