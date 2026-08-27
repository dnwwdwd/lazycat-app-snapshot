package storage

import (
	"archive/zip"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func TestStoreRejectsSymbolicLinkBelowDocumentRoot(t *testing.T) {
	root := t.TempDir()
	store, err := New(root)
	if err != nil {
		t.Fatal(err)
	}
	outside := t.TempDir()
	if err := os.Symlink(outside, filepath.Join(root, ProductDirectory, "_partial")); err != nil {
		t.Fatal(err)
	}
	if _, err := store.CreatePartial("job-a"); err == nil {
		t.Fatal("expected symbolic link rejection")
	}
}

func TestQuickVerifyRejectsUnsafeArchiveEntry(t *testing.T) {
	store, err := New(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	partial, err := store.CreatePartial("job-a")
	if err != nil {
		t.Fatal(err)
	}
	archive, err := store.CreateArchive(partial)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(archive)
	entry, err := writer.Create("../escape")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := entry.Write([]byte("bad")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := archive.Close(); err != nil {
		t.Fatal(err)
	}
	size, digest, err := store.Digest(partial.Archive)
	if err != nil {
		t.Fatal(err)
	}
	location, err := store.CommitArchive(partial, "20260827T160000.000Z", "deploy-a", "job-a")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.WriteManifest(location, []byte(`{"status":"completed"}`)); err != nil {
		t.Fatal(err)
	}
	if err := store.QuickVerify(location, size, digest); err == nil {
		t.Fatal("expected unsafe archive entry rejection")
	}
}

func TestGoZipWriterUsesZIP64ForManyEntries(t *testing.T) {
	filename := filepath.Join(t.TempDir(), "many.zip")
	file, err := os.Create(filename)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for index := 0; index < 65536; index++ {
		if _, err := writer.Create("appvar/entry-" + strconv.Itoa(index)); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	reader, err := zip.OpenReader(filename)
	if err != nil {
		t.Fatal(err)
	}
	defer reader.Close()
	if len(reader.File) != 65536 {
		t.Fatalf("ZIP64 entry count=%d", len(reader.File))
	}
}
