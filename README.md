# Naeema POS

Aplikasi kasir, stok, dan kas untuk Naeema. Versi pertama (uji coba).

## Fitur

- **Kasir**: penjualan dari toko offline, marketplace (Shopee, Tokopedia, TikTok Shop, Lazada), atau pameran/event.
  Mata uang IDR (default), MYR, SGD. Kurs ke IDR dikunci di setiap nota. Setiap pembayaran dicatat masuk ke dompet siapa.
- **Produk & stok**: produk per kategori, varian warna/ukuran, harga IDR + harga resmi MYR/SGD.
  Stok per lokasi (gudang, toko, booth pameran), barang masuk, pindah lokasi, stock opname, riwayat mutasi.
- **Event**: nama, kota, negara, tanggal, mata uang. Lokasi stok booth dibuat otomatis.
  Laporan event: penjualan, pengeluaran, stok dibawa/terjual/sisa, uang masuk ke siapa, pengembalian sisa stok.
- **Kas per orang**: saldo tiap dompet (orang, rekening, saldo marketplace) per mata uang.
  Setoran dan serah terima uang menunggu konfirmasi penerima; pengeluaran dan tukar valas dicatat dengan kurs sebenarnya.
- **Laporan**: penjualan per sumber, marketplace, event, mata uang, kategori, kasir; rekonsiliasi uang per orang;
  produk terlaris; unduh CSV penjualan.
- **Peran**: Owner/Admin melihat semua; Staf hanya input penjualan dan mengelola dompetnya sendiri.

## Menjalankan di komputer

Butuh Node.js 20+.

```bash
npm install
cp .env.example .env        # DATABASE_URL="file:./dev.db"
npx prisma migrate deploy
npm run db:seed             # data contoh (opsional)
npm run dev                 # buka http://localhost:3000
```

Tes logika inti: `npm test`.

## Cara uang dihitung

Semua nilai disimpan dalam satuan terkecil (rupiah, sen). Saldo dompet =
uang dari penjualan + uang masuk terkonfirmasi − uang keluar terkonfirmasi.
Setoran yang belum dikonfirmasi tampil terpisah dan belum mengurangi saldo.

## Belum ada di versi ini

- Login dengan password/PIN (sekarang cukup pilih nama).
- Mode offline penuh untuk booth tanpa internet.
- Impor pesanan marketplace dari file CSV/Excel dan sinkron stok otomatis.
- Cetak struk.
- Database online (Postgres) untuk dipakai banyak perangkat sekaligus. Sekarang SQLite, cocok untuk uji coba.
